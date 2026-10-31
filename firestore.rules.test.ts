import fs from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

/**
 * Payload-First Security TDD Test Suite ("Dirty Dozen" + Happy Paths)
 * Verifies that all 12 adversarial payloads in security_spec.md return PERMISSION_DENIED.
 */
export async function runFirestoreSecurityRuleTests(): Promise<void> {
  const rules = fs.existsSync('firestore.rules')
    ? fs.readFileSync('firestore.rules', 'utf8')
    : fs.readFileSync('DRAFT_firestore.rules', 'utf8');

  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: 'demo-fridgepago-security-test',
    firestore: { rules },
  });

  try {
    const aliceCtx = testEnv.authenticatedContext('uid_alice', {
      email: 'jseongho92@gmail.com',
      email_verified: true,
    });
    const unverifiedAliceCtx = testEnv.authenticatedContext('uid_alice', {
      email: 'jseongho92@gmail.com',
      email_verified: false,
    });
    const ownerNoProfileCtx = testEnv.authenticatedContext('uid_owner_noprofile', {
      email: 'jseongho92@gmail.com',
      email_verified: true,
    });
    const malloryCtx = testEnv.authenticatedContext('uid_mallory', {
      email: 'mallory@example.com',
      email_verified: true,
    });

    const aliceDb = aliceCtx.firestore();

    // 1. Dirty Dozen #1: Unverified Owner Email Spoof -> DENIED
    await assertFails(
      setDoc(doc(unverifiedAliceCtx.firestore(), 'users/uid_alice'), {
        userId: 'uid_alice',
        nickname: '자취셰프',
        householdLabel: '1인 가구',
        monthlyBudget: 250000,
        allergiesAndDislikes: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 2. Dirty Dozen #3: Orphaned Subcollection Write Before Parent Profile Exists -> DENIED
    await assertFails(
      setDoc(doc(ownerNoProfileCtx.firestore(), 'users/uid_owner_noprofile/ingredients/ing_1'), {
        id: 'ing_1',
        userId: 'uid_owner_noprofile',
        name: '두부',
        category: '가공식품',
        quantity: 1,
        unit: '모',
        storage: '냉장',
        purchaseDate: '2026-10-30',
        expiryDate: '2026-11-02',
        hasPurchasePrice: true,
        purchasePrice: 2200,
        memo: '',
        isSample: false,
        clientCreatedAt: '2026-10-30T00:00:00.000Z',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Baseline valid setup: Verified App Owner creates own parent profile -> SUCCEEDS
    await assertSucceeds(
      setDoc(doc(aliceDb, 'users/uid_alice'), {
        userId: 'uid_alice',
        nickname: '자취셰프',
        householdLabel: '1인 가구 스마트 홈키친',
        monthlyBudget: 250000,
        allergiesAndDislikes: ['땅콩'],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Baseline valid ingredient creation for Verified App Owner -> SUCCEEDS
    await assertSucceeds(
      setDoc(doc(aliceDb, 'users/uid_alice/ingredients/ing_valid'), {
        id: 'ing_valid',
        userId: 'uid_alice',
        name: '애호박',
        category: '채소',
        quantity: 2,
        unit: '개',
        storage: '냉장',
        purchaseDate: '2026-10-30',
        expiryDate: '2026-11-03',
        hasPurchasePrice: true,
        purchasePrice: 1900,
        memo: '볶음용',
        isSample: false,
        clientCreatedAt: '2026-10-30T00:00:00.000Z',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 3a. Dirty Dozen #2a: Verified Non-Owner Third-Party Account Attempting Own Profile Creation -> DENIED
    await assertFails(
      setDoc(doc(malloryCtx.firestore(), 'users/uid_mallory'), {
        userId: 'uid_mallory',
        nickname: '외부사용자',
        householdLabel: '외부 계정',
        monthlyBudget: 200000,
        allergiesAndDislikes: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 3b. Dirty Dozen #2b: Cross-Tenant Identity Spoofing -> DENIED
    await assertFails(
      setDoc(doc(malloryCtx.firestore(), 'users/uid_alice/ingredients/ing_hack'), {
        id: 'ing_hack',
        userId: 'uid_alice',
        name: '양파',
        category: '채소',
        quantity: 1,
        unit: '개',
        storage: '실온',
        purchaseDate: '2026-10-30',
        expiryDate: '',
        hasPurchasePrice: false,
        purchasePrice: 0,
        memo: '',
        isSample: false,
        clientCreatedAt: '2026-10-30T00:00:00.000Z',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 4. Dirty Dozen #4: Shadow / Ghost Field Injection on Create -> DENIED
    await assertFails(
      setDoc(doc(aliceDb, 'users/uid_alice/ingredients/ing_ghost'), {
        id: 'ing_ghost',
        userId: 'uid_alice',
        name: '달걀',
        category: '알류',
        quantity: 4,
        unit: '개',
        storage: '냉장',
        purchaseDate: '2026-10-30',
        expiryDate: '2026-11-05',
        hasPurchasePrice: true,
        purchasePrice: 2400,
        memo: '',
        isSample: false,
        clientCreatedAt: '2026-10-30T00:00:00.000Z',
        isAdmin: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 5. Dirty Dozen #5: Shadow Field Injection on Update -> DENIED
    await assertFails(
      updateDoc(doc(aliceDb, 'users/uid_alice/ingredients/ing_valid'), {
        quantity: 1,
        role: 'admin',
        updatedAt: serverTimestamp(),
      })
    );

    // 6. Dirty Dozen #6: Value Poisoning on Whitelisted Update Key -> DENIED
    await assertFails(
      updateDoc(doc(aliceDb, 'users/uid_alice/ingredients/ing_valid'), {
        quantity: -50,
        updatedAt: serverTimestamp(),
      })
    );

    // 7. Dirty Dozen #7: Path Variable ID Poisoning -> DENIED
    await assertFails(
      setDoc(doc(aliceDb, 'users/uid_alice/ingredients/bad$id!'), {
        id: 'bad$id!',
        userId: 'uid_alice',
        name: '대파',
        category: '채소',
        quantity: 1,
        unit: '단',
        storage: '냉장',
        purchaseDate: '2026-10-30',
        expiryDate: '',
        hasPurchasePrice: false,
        purchasePrice: 0,
        memo: '',
        isSample: false,
        clientCreatedAt: '2026-10-30T00:00:00.000Z',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 8. Dirty Dozen #8: String Oversize Resource Exhaustion -> DENIED
    await assertFails(
      setDoc(doc(aliceDb, 'users/uid_alice/ingredients/ing_huge'), {
        id: 'ing_huge',
        userId: 'uid_alice',
        name: '우유',
        category: '유제품',
        quantity: 1,
        unit: '개',
        storage: '냉장',
        purchaseDate: '2026-10-30',
        expiryDate: '',
        hasPurchasePrice: false,
        purchasePrice: 0,
        memo: 'X'.repeat(5000),
        isSample: false,
        clientCreatedAt: '2026-10-30T00:00:00.000Z',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 9. Dirty Dozen #9: Unbounded Array & Element Type Poisoning -> DENIED
    await assertFails(
      updateDoc(doc(aliceDb, 'users/uid_alice'), {
        allergiesAndDislikes: Array.from({ length: 45 }, (_, i) => `item_${i}`),
        updatedAt: serverTimestamp(),
      })
    );

    // 10. Dirty Dozen #10: Forged Client Timestamp -> DENIED
    await assertFails(
      setDoc(doc(aliceDb, 'users/uid_alice/expenses/exp_forged'), {
        id: 'exp_forged',
        userId: 'uid_alice',
        date: '2026-10-30',
        month: '2026-10',
        itemName: '장보기',
        category: '채소',
        amount: 5000,
        memo: '',
        isSample: false,
        createdAt: Timestamp.fromMillis(1700000000000),
        updatedAt: serverTimestamp(),
      })
    );

    // 11. Dirty Dozen #11: Immutable Field Tampering on Update -> DENIED
    await assertSucceeds(
      setDoc(doc(aliceDb, 'users/uid_alice/shoppingItems/shop_1'), {
        id: 'shop_1',
        userId: 'uid_alice',
        name: '양파',
        category: '채소',
        quantity: 2,
        unit: '개',
        estimatedPrice: 2000,
        checked: false,
        preferredStore: 'coupang',
        sourceRecipeTitle: '',
        isSample: false,
        clientCreatedAt: '2026-10-30T00:00:00.000Z',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(
      updateDoc(doc(aliceDb, 'users/uid_alice/shoppingItems/shop_1'), {
        userId: 'uid_mallory',
        checked: true,
        updatedAt: serverTimestamp(),
      })
    );

    // 12. Dirty Dozen #12: Unauthorized Cross-User Read / Query Scraping -> DENIED
    await assertFails(getDoc(doc(malloryCtx.firestore(), 'users/uid_alice')));
    await assertFails(
      getDocs(
        query(
          collection(malloryCtx.firestore(), 'users/uid_alice/ingredients'),
          where('userId', '==', 'uid_alice')
        )
      )
    );
  } finally {
    await testEnv.cleanup();
  }
}
