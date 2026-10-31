import freshVeggiesImg from '../assets/images/fresh_veggies_counter_1793338593611.jpg';
import eggsMilkDairyImg from '../assets/images/eggs_milk_dairy_1793338596140.jpg';
import freshMeatProduceImg from '../assets/images/fresh_meat_produce_1793338597232.jpg';
import koreanTofuDishImg from '../assets/images/korean_tofu_dish_1793338598946.jpg';
import quickSkilletMealImg from '../assets/images/quick_skillet_meal_1793338598695.jpg';
import { Ingredient, IngredientCategory, Recipe } from '../types';

export function getIngredientImage(ingredient: Pick<Ingredient, 'name' | 'category' | 'customImageDataUrl'>): string {
  if (ingredient.customImageDataUrl) {
    return ingredient.customImageDataUrl;
  }

  const name = ingredient.name.toLowerCase();

  if (
    name.includes('달걀') ||
    name.includes('계란') ||
    name.includes('메추리알') ||
    name.includes('우유') ||
    name.includes('치즈') ||
    name.includes('요거트') ||
    name.includes('버터')
  ) {
    return eggsMilkDairyImg;
  }

  if (
    name.includes('애호박') ||
    name.includes('호박') ||
    name.includes('두부') ||
    name.includes('순두부') ||
    name.includes('대파') ||
    name.includes('쪽파') ||
    name.includes('양파') ||
    name.includes('마늘') ||
    name.includes('배추') ||
    name.includes('시금치')
  ) {
    return freshVeggiesImg;
  }

  const categoryMap: Record<IngredientCategory, string> = {
    채소: freshVeggiesImg,
    유제품: eggsMilkDairyImg,
    알류: eggsMilkDairyImg,
    육류: freshMeatProduceImg,
    해산물: freshMeatProduceImg,
    과일: freshMeatProduceImg,
    곡류: freshMeatProduceImg,
    가공식품: freshVeggiesImg,
    기타: freshMeatProduceImg,
  };

  return categoryMap[ingredient.category] || freshVeggiesImg;
}

export function getRecipeImage(recipe: Pick<Recipe, 'title' | 'cuisine'>): string {
  const title = recipe.title.toLowerCase();
  const cuisine = recipe.cuisine.toLowerCase();

  if (
    title.includes('오믈렛') ||
    title.includes('스크램블') ||
    title.includes('파스타') ||
    title.includes('토스트') ||
    title.includes('샐러드') ||
    title.includes('프리타타') ||
    cuisine.includes('양식') ||
    cuisine.includes('간편식')
  ) {
    return quickSkilletMealImg;
  }

  if (
    title.includes('찌개') ||
    title.includes('조림') ||
    title.includes('볶음') ||
    title.includes('국') ||
    title.includes('덮밥') ||
    title.includes('전') ||
    cuisine.includes('한식') ||
    cuisine.includes('중식') ||
    cuisine.includes('일식')
  ) {
    return koreanTofuDishImg;
  }

  return koreanTofuDishImg;
}
