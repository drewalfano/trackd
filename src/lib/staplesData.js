/**
 * Common whole foods, as a static table.
 *
 * GENERATED FILE — do not edit by hand. Regenerate with:
 *
 *   node scripts/build-staples.mjs --data <sr-legacy.json>
 *
 * Source: USDA FoodData Central, SR Legacy. A work of the US federal
 * government, public domain, no API key and no account — which matters here,
 * because a key would be the first credential this app has ever needed and it
 * is built around not having one.
 *
 * Every macro below is copied from that dataset, per 100 g of edible portion.
 * The name, the note, the synonyms and the portion are editorial and live in
 * scripts/staples-manifest.mjs; the reasoning for each is there.
 *
 * ---
 *
 * The gap this fills: Open Food Facts is a database of BARCODED PACKAGED
 * PRODUCTS. Searching it for `egg` returns twenty-one thousand things that
 * CONTAIN egg — mayonnaise, madeleines, cheddar röstis — because its text search
 * reads ingredient lists, and its best honest answer is still a branded box of
 * eggs rather than an egg. No change to the query fixes that; the data is not
 * in there. So the basics live here instead.
 *
 * `note` is kept separate from `name` so the naming convention is one line in
 * `stapleName` rather than 118 edits here. `aka` is searched and never
 * shown: the word someone types is often not the word on the row — cheese has
 * to find Cheddar, and the same table serves shrimp and prawns, yogurt and
 * yoghurt, whole wheat and wholemeal.
 *
 * `sodium` is null where the dataset has no value for it. Null is honest; a
 * zero would be a claim.
 */

/** @typedef {{name: string, note?: string, aka?: string, servingSize: number, servingLabel: string, per100: {kcal: number, protein: number, fat: number, carbs: number, sodium: number|null}}} Staple */

export const STAPLES = [
  { name: "Almond milk", note: "unsweetened", servingSize: 240, servingLabel: "1 cup (240 g)", per100: { kcal: 15, protein: 0.4, fat: 0.96, carbs: 1.31, sodium: 72 } },
  { name: "Almonds", servingSize: 28, servingLabel: "1 oz (28 g)", per100: { kcal: 579, protein: 21.2, fat: 49.9, carbs: 21.6, sodium: 1 } },
  { name: "Apple", servingSize: 182, servingLabel: "1 medium (182 g)", per100: { kcal: 57, protein: 0.28, fat: 0.15, carbs: 13.6, sodium: 2 } },
  { name: "Asparagus", note: "raw", servingSize: 134, servingLabel: "1 cup (134 g)", per100: { kcal: 20, protein: 2.2, fat: 0.12, carbs: 3.88, sodium: 2 } },
  { name: "Aubergine", note: "raw", aka: "eggplant", servingSize: 82, servingLabel: "1 cup (82 g)", per100: { kcal: 25, protein: 0.98, fat: 0.18, carbs: 5.88, sodium: 2 } },
  { name: "Avocado", servingSize: 100, servingLabel: "1/2 avocado (100 g)", per100: { kcal: 160, protein: 2, fat: 14.7, carbs: 8.53, sodium: 7 } },
  { name: "Bacon", note: "cooked", servingSize: 8, servingLabel: "1 slice (8 g)", per100: { kcal: 548, protein: 35.7, fat: 43.3, carbs: 1.35, sodium: 2190 } },
  { name: "Baked beans", servingSize: 254, servingLabel: "1 cup (254 g)", per100: { kcal: 94, protein: 4.75, fat: 0.37, carbs: 21.1, sodium: 343 } },
  { name: "Banana", servingSize: 118, servingLabel: "1 medium (118 g)", per100: { kcal: 89, protein: 1.09, fat: 0.33, carbs: 22.8, sodium: 1 } },
  { name: "Beetroot", note: "raw", aka: "beets", servingSize: 82, servingLabel: "1 beet (82 g)", per100: { kcal: 43, protein: 1.61, fat: 0.17, carbs: 9.56, sodium: 78 } },
  { name: "Black beans", note: "cooked", servingSize: 172, servingLabel: "1 cup (172 g)", per100: { kcal: 132, protein: 8.86, fat: 0.54, carbs: 23.7, sodium: 1 } },
  { name: "Blackberries", servingSize: 144, servingLabel: "1 cup (144 g)", per100: { kcal: 43, protein: 1.39, fat: 0.49, carbs: 9.61, sodium: 1 } },
  { name: "Blueberries", servingSize: 148, servingLabel: "1 cup (148 g)", per100: { kcal: 57, protein: 0.74, fat: 0.33, carbs: 14.5, sodium: 1 } },
  { name: "Broccoli", note: "raw", servingSize: 91, servingLabel: "1 cup (91 g)", per100: { kcal: 34, protein: 2.82, fat: 0.37, carbs: 6.64, sodium: 33 } },
  { name: "Brown rice", note: "cooked", servingSize: 195, servingLabel: "1 cup (195 g)", per100: { kcal: 123, protein: 2.74, fat: 0.97, carbs: 25.6, sodium: 4 } },
  { name: "Butter", servingSize: 14, servingLabel: "1 tbsp (14 g)", per100: { kcal: 717, protein: 0.85, fat: 81.1, carbs: 0.06, sodium: 643 } },
  { name: "Butternut squash", note: "raw", servingSize: 140, servingLabel: "1 cup (140 g)", per100: { kcal: 45, protein: 1, fat: 0.1, carbs: 11.7, sodium: 4 } },
  { name: "Cabbage", note: "raw", servingSize: 89, servingLabel: "1 cup (89 g)", per100: { kcal: 25, protein: 1.28, fat: 0.1, carbs: 5.8, sodium: 18 } },
  { name: "Carrot", note: "raw", servingSize: 61, servingLabel: "1 medium (61 g)", per100: { kcal: 41, protein: 0.93, fat: 0.24, carbs: 9.58, sodium: 69 } },
  { name: "Cashews", servingSize: 28, servingLabel: "1 oz (28 g)", per100: { kcal: 553, protein: 18.2, fat: 43.8, carbs: 30.2, sodium: 12 } },
  { name: "Cauliflower", note: "raw", servingSize: 107, servingLabel: "1 cup (107 g)", per100: { kcal: 25, protein: 1.92, fat: 0.28, carbs: 4.97, sodium: 30 } },
  { name: "Celery", note: "raw", servingSize: 40, servingLabel: "1 stalk (40 g)", per100: { kcal: 14, protein: 0.69, fat: 0.17, carbs: 2.97, sodium: 80 } },
  { name: "Cheddar", aka: "cheese", servingSize: 28, servingLabel: "1 oz (28 g)", per100: { kcal: 410, protein: 24.2, fat: 33.8, carbs: 2.13, sodium: 644 } },
  { name: "Cherries", servingSize: 154, servingLabel: "1 cup (154 g)", per100: { kcal: 63, protein: 1.06, fat: 0.2, carbs: 16, sodium: 0 } },
  { name: "Chia seeds", servingSize: 28, servingLabel: "1 oz (28 g)", per100: { kcal: 486, protein: 16.5, fat: 30.7, carbs: 42.1, sodium: 16 } },
  { name: "Chicken breast", note: "raw", servingSize: 174, servingLabel: "1 breast (174 g)", per100: { kcal: 120, protein: 22.5, fat: 2.62, carbs: 0, sodium: 45 } },
  { name: "Chicken drumstick", note: "raw", servingSize: 100, servingLabel: "100 g", per100: { kcal: 116, protein: 19.4, fat: 3.71, carbs: 0, sodium: 114 } },
  { name: "Chicken thigh", note: "raw", servingSize: 100, servingLabel: "100 g", per100: { kcal: 121, protein: 19.7, fat: 4.12, carbs: 0, sodium: 95 } },
  { name: "Chickpeas", note: "cooked", aka: "garbanzo", servingSize: 164, servingLabel: "1 cup (164 g)", per100: { kcal: 164, protein: 8.86, fat: 2.59, carbs: 27.4, sodium: 7 } },
  { name: "Coconut oil", servingSize: 13.6, servingLabel: "1 tbsp (13.6 g)", per100: { kcal: 892, protein: 0, fat: 99.1, carbs: 0, sodium: 0 } },
  { name: "Cod", note: "raw", servingSize: 115, servingLabel: "1 fillet (115 g)", per100: { kcal: 82, protein: 17.8, fat: 0.67, carbs: 0, sodium: 54 } },
  { name: "Coffee", note: "black", servingSize: 237, servingLabel: "1 cup (237 g)", per100: { kcal: 1, protein: 0.12, fat: 0.02, carbs: 0, sodium: 2 } },
  { name: "Cottage cheese", note: "2%", servingSize: 226, servingLabel: "1 cup (226 g)", per100: { kcal: 81, protein: 10.4, fat: 2.27, carbs: 4.76, sodium: 308 } },
  { name: "Courgette", note: "raw", aka: "zucchini", servingSize: 124, servingLabel: "1 medium (124 g)", per100: { kcal: 17, protein: 1.21, fat: 0.32, carbs: 3.11, sodium: 8 } },
  { name: "Couscous", note: "cooked", servingSize: 157, servingLabel: "1 cup (157 g)", per100: { kcal: 112, protein: 3.79, fat: 0.16, carbs: 23.2, sodium: 5 } },
  { name: "Cream cheese", servingSize: 14, servingLabel: "1 tbsp (14 g)", per100: { kcal: 350, protein: 6.15, fat: 34.4, carbs: 5.52, sodium: 314 } },
  { name: "Cucumber", note: "raw", servingSize: 104, servingLabel: "1/2 cucumber (104 g)", per100: { kcal: 15, protein: 0.65, fat: 0.11, carbs: 3.63, sodium: 2 } },
  { name: "Dates", note: "medjool", servingSize: 24, servingLabel: "1 date (24 g)", per100: { kcal: 277, protein: 1.81, fat: 0.15, carbs: 75, sodium: 1 } },
  { name: "Double cream", aka: "heavy cream whipping", servingSize: 15, servingLabel: "1 tbsp (15 g)", per100: { kcal: 340, protein: 2.84, fat: 36.1, carbs: 2.84, sodium: 27 } },
  { name: "Edamame", aka: "soybeans", servingSize: 155, servingLabel: "1 cup (155 g)", per100: { kcal: 141, protein: 12.4, fat: 6.4, carbs: 11, sodium: 14 } },
  { name: "Egg", servingSize: 50, servingLabel: "1 large egg (50 g)", per100: { kcal: 143, protein: 12.6, fat: 9.51, carbs: 0.72, sodium: 142 } },
  { name: "Egg white", servingSize: 33, servingLabel: "1 large white (33 g)", per100: { kcal: 52, protein: 10.9, fat: 0.17, carbs: 0.73, sodium: 166 } },
  { name: "Egg yolk", servingSize: 17, servingLabel: "1 large yolk (17 g)", per100: { kcal: 322, protein: 15.9, fat: 26.5, carbs: 3.59, sodium: 48 } },
  { name: "English muffin", servingSize: 57, servingLabel: "1 muffin (57 g)", per100: { kcal: 227, protein: 8.87, fat: 1.69, carbs: 44.2, sodium: 425 } },
  { name: "Feta", aka: "cheese", servingSize: 28, servingLabel: "1 oz (28 g)", per100: { kcal: 265, protein: 14.2, fat: 21.5, carbs: 3.88, sodium: 1140 } },
  { name: "Flour tortilla", servingSize: 45, servingLabel: "1 tortilla (45 g)", per100: { kcal: 297, protein: 8.01, fat: 7.58, carbs: 49.3, sodium: 742 } },
  { name: "Garlic", note: "raw", servingSize: 3, servingLabel: "1 clove (3 g)", per100: { kcal: 149, protein: 6.36, fat: 0.5, carbs: 33.1, sodium: 17 } },
  { name: "Grapes", servingSize: 151, servingLabel: "1 cup (151 g)", per100: { kcal: 69, protein: 0.72, fat: 0.16, carbs: 18.1, sodium: 2 } },
  { name: "Greek yoghurt", note: "nonfat", aka: "yogurt", servingSize: 170, servingLabel: "1 pot (170 g)", per100: { kcal: 59, protein: 10.2, fat: 0.39, carbs: 3.6, sodium: 36 } },
  { name: "Greek yoghurt", note: "whole milk", aka: "yogurt", servingSize: 170, servingLabel: "1 pot (170 g)", per100: { kcal: 97, protein: 9, fat: 5, carbs: 3.98, sodium: 35 } },
  { name: "Green beans", note: "raw", servingSize: 100, servingLabel: "1 cup (100 g)", per100: { kcal: 31, protein: 1.83, fat: 0.22, carbs: 6.97, sodium: 6 } },
  { name: "Ground beef", note: "85% lean, raw", aka: "mince minced hamburger", servingSize: 113, servingLabel: "4 oz (113 g)", per100: { kcal: 215, protein: 18.6, fat: 15, carbs: 0, sodium: 66 } },
  { name: "Ground beef", note: "93% lean, raw", aka: "mince minced", servingSize: 113, servingLabel: "4 oz (113 g)", per100: { kcal: 152, protein: 20.8, fat: 7, carbs: 0, sodium: 66 } },
  { name: "Honey", servingSize: 21, servingLabel: "1 tbsp (21 g)", per100: { kcal: 304, protein: 0.3, fat: 0, carbs: 82.4, sodium: 4 } },
  { name: "Kale", note: "raw", servingSize: 21, servingLabel: "1 cup (21 g)", per100: { kcal: 35, protein: 2.92, fat: 1.49, carbs: 4.42, sodium: 53 } },
  { name: "Kidney beans", note: "cooked", servingSize: 177, servingLabel: "1 cup (177 g)", per100: { kcal: 127, protein: 8.67, fat: 0.5, carbs: 22.8, sodium: 2 } },
  { name: "Kiwi", servingSize: 76, servingLabel: "1 kiwi (76 g)", per100: { kcal: 61, protein: 1.14, fat: 0.52, carbs: 14.7, sodium: 3 } },
  { name: "Lamb loin", note: "raw", servingSize: 113, servingLabel: "4 oz (113 g)", per100: { kcal: 143, protein: 20.9, fat: 5.94, carbs: 0, sodium: 68 } },
  { name: "Lemon", servingSize: 58, servingLabel: "1 lemon (58 g)", per100: { kcal: 29, protein: 1.1, fat: 0.3, carbs: 9.32, sodium: 2 } },
  { name: "Lentils", note: "cooked", servingSize: 198, servingLabel: "1 cup (198 g)", per100: { kcal: 116, protein: 9.02, fat: 0.38, carbs: 20.1, sodium: 2 } },
  { name: "Mango", servingSize: 165, servingLabel: "1 cup (165 g)", per100: { kcal: 60, protein: 0.82, fat: 0.38, carbs: 15, sodium: 1 } },
  { name: "Maple syrup", servingSize: 20, servingLabel: "1 tbsp (20 g)", per100: { kcal: 260, protein: 0.04, fat: 0.06, carbs: 67, sodium: 12 } },
  { name: "Milk", note: "2%", servingSize: 244, servingLabel: "1 cup (244 g)", per100: { kcal: 50, protein: 3.3, fat: 1.98, carbs: 4.8, sodium: 47 } },
  { name: "Milk", note: "skim", aka: "nonfat", servingSize: 245, servingLabel: "1 cup (245 g)", per100: { kcal: 41, protein: 3.96, fat: 0.25, carbs: 5.56, sodium: 59 } },
  { name: "Milk", note: "whole", servingSize: 244, servingLabel: "1 cup (244 g)", per100: { kcal: 61, protein: 3.15, fat: 3.25, carbs: 4.8, sodium: 43 } },
  { name: "Mozzarella", aka: "cheese", servingSize: 28, servingLabel: "1 oz (28 g)", per100: { kcal: 299, protein: 22.2, fat: 22.1, carbs: 2.4, sodium: 486 } },
  { name: "Mushrooms", note: "raw", servingSize: 70, servingLabel: "1 cup (70 g)", per100: { kcal: 22, protein: 3.09, fat: 0.34, carbs: 3.26, sodium: 5 } },
  { name: "Olive oil", servingSize: 13.5, servingLabel: "1 tbsp (13.5 g)", per100: { kcal: 884, protein: 0, fat: 100, carbs: 0, sodium: 2 } },
  { name: "Onion", note: "raw", servingSize: 110, servingLabel: "1 medium (110 g)", per100: { kcal: 40, protein: 1.1, fat: 0.1, carbs: 9.34, sodium: 4 } },
  { name: "Orange", servingSize: 131, servingLabel: "1 medium (131 g)", per100: { kcal: 47, protein: 0.94, fat: 0.12, carbs: 11.8, sodium: 0 } },
  { name: "Orange juice", servingSize: 248, servingLabel: "1 cup (248 g)", per100: { kcal: 21, protein: 0.21, fat: 0, carbs: 5.42, sodium: 4 } },
  { name: "Parmesan", aka: "cheese", servingSize: 5, servingLabel: "1 tbsp (5 g)", per100: { kcal: 420, protein: 28.4, fat: 27.8, carbs: 13.9, sodium: 1800 } },
  { name: "Pasta", note: "cooked", aka: "spaghetti", servingSize: 140, servingLabel: "1 cup (140 g)", per100: { kcal: 158, protein: 5.8, fat: 0.93, carbs: 30.9, sodium: 1 } },
  { name: "Peach", servingSize: 150, servingLabel: "1 medium (150 g)", per100: { kcal: 39, protein: 0.91, fat: 0.25, carbs: 9.54, sodium: 0 } },
  { name: "Peanut butter", servingSize: 32, servingLabel: "2 tbsp (32 g)", per100: { kcal: 598, protein: 22.2, fat: 51.4, carbs: 22.3, sodium: 17 } },
  { name: "Peanuts", servingSize: 28, servingLabel: "1 oz (28 g)", per100: { kcal: 567, protein: 25.8, fat: 49.2, carbs: 16.1, sodium: 18 } },
  { name: "Pear", servingSize: 178, servingLabel: "1 medium (178 g)", per100: { kcal: 57, protein: 0.36, fat: 0.14, carbs: 15.2, sodium: 1 } },
  { name: "Peas", note: "raw", servingSize: 145, servingLabel: "1 cup (145 g)", per100: { kcal: 81, protein: 5.42, fat: 0.4, carbs: 14.4, sodium: 5 } },
  { name: "Pecans", servingSize: 28, servingLabel: "1 oz (28 g)", per100: { kcal: 691, protein: 9.17, fat: 72, carbs: 13.9, sodium: 0 } },
  { name: "Pineapple", servingSize: 165, servingLabel: "1 cup (165 g)", per100: { kcal: 50, protein: 0.54, fat: 0.12, carbs: 13.1, sodium: 1 } },
  { name: "Pistachios", servingSize: 28, servingLabel: "1 oz (28 g)", per100: { kcal: 560, protein: 20.2, fat: 45.3, carbs: 27.2, sodium: 1 } },
  { name: "Plain flour", aka: "all purpose white flour", servingSize: 125, servingLabel: "1 cup (125 g)", per100: { kcal: 364, protein: 10.3, fat: 0.98, carbs: 76.3, sodium: 2 } },
  { name: "Plum", servingSize: 66, servingLabel: "1 plum (66 g)", per100: { kcal: 46, protein: 0.7, fat: 0.28, carbs: 11.4, sodium: 0 } },
  { name: "Pork sausage", note: "raw", servingSize: 50, servingLabel: "1 sausage (50 g)", per100: { kcal: 290, protein: 13.9, fat: 24.3, carbs: 2.97, sodium: 563 } },
  { name: "Pork tenderloin", note: "raw", servingSize: 113, servingLabel: "4 oz (113 g)", per100: { kcal: 109, protein: 21, fat: 2.17, carbs: 0, sodium: 53 } },
  { name: "Potato", note: "raw", servingSize: 213, servingLabel: "1 medium (213 g)", per100: { kcal: 77, protein: 2.05, fat: 0.09, carbs: 17.5, sodium: 6 } },
  { name: "Prawns", note: "raw", aka: "shrimp", servingSize: 100, servingLabel: "100 g", per100: { kcal: 71, protein: 13.6, fat: 1.01, carbs: 0.91, sodium: 566 } },
  { name: "Pumpkin seeds", servingSize: 28, servingLabel: "1 oz (28 g)", per100: { kcal: 559, protein: 30.2, fat: 49, carbs: 10.7, sodium: 7 } },
  { name: "Quinoa", note: "cooked", servingSize: 185, servingLabel: "1 cup (185 g)", per100: { kcal: 120, protein: 4.4, fat: 1.92, carbs: 21.3, sodium: 7 } },
  { name: "Raisins", servingSize: 43, servingLabel: "1/4 cup (43 g)", per100: { kcal: 299, protein: 3.3, fat: 0.25, carbs: 79.3, sodium: 26 } },
  { name: "Raspberries", servingSize: 123, servingLabel: "1 cup (123 g)", per100: { kcal: 52, protein: 1.2, fat: 0.65, carbs: 11.9, sodium: 1 } },
  { name: "Red pepper", aka: "bell capsicum", servingSize: 119, servingLabel: "1 medium (119 g)", per100: { kcal: 26, protein: 0.99, fat: 0.3, carbs: 6.03, sodium: 4 } },
  { name: "Rolled oats", note: "dry", aka: "oatmeal porridge", servingSize: 40, servingLabel: "40 g dry", per100: { kcal: 379, protein: 13.2, fat: 6.52, carbs: 67.7, sodium: 6 } },
  { name: "Romaine lettuce", aka: "cos salad", servingSize: 47, servingLabel: "1 cup (47 g)", per100: { kcal: 17, protein: 1.23, fat: 0.3, carbs: 3.29, sodium: 8 } },
  { name: "Salmon", note: "raw", servingSize: 170, servingLabel: "1 fillet (170 g)", per100: { kcal: 208, protein: 20.4, fat: 13.4, carbs: 0, sodium: 59 } },
  { name: "Salt", servingSize: 6, servingLabel: "1 tsp (6 g)", per100: { kcal: 0, protein: 0, fat: 0, carbs: 0, sodium: 38800 } },
  { name: "Scallops", note: "raw", servingSize: 100, servingLabel: "100 g", per100: { kcal: 69, protein: 12.1, fat: 0.49, carbs: 3.18, sodium: 392 } },
  { name: "Sirloin steak", note: "raw", aka: "beef", servingSize: 113, servingLabel: "4 oz (113 g)", per100: { kcal: 131, protein: 22.1, fat: 4.08, carbs: 0, sodium: 56 } },
  { name: "Spinach", note: "raw", servingSize: 30, servingLabel: "1 cup (30 g)", per100: { kcal: 23, protein: 2.86, fat: 0.39, carbs: 3.63, sodium: 79 } },
  { name: "Strawberries", servingSize: 152, servingLabel: "1 cup (152 g)", per100: { kcal: 32, protein: 0.67, fat: 0.3, carbs: 7.68, sodium: 1 } },
  { name: "Sugar", aka: "granulated caster white", servingSize: 4, servingLabel: "1 tsp (4 g)", per100: { kcal: 387, protein: 0, fat: 0, carbs: 100, sodium: 1 } },
  { name: "Sunflower oil", servingSize: 13.6, servingLabel: "1 tbsp (13.6 g)", per100: { kcal: 884, protein: 0, fat: 100, carbs: 0, sodium: 0 } },
  { name: "Sunflower seeds", servingSize: 28, servingLabel: "1 oz (28 g)", per100: { kcal: 584, protein: 20.8, fat: 51.5, carbs: 20, sodium: 9 } },
  { name: "Sweet potato", note: "raw", aka: "yam", servingSize: 130, servingLabel: "1 medium (130 g)", per100: { kcal: 86, protein: 1.57, fat: 0.05, carbs: 20.1, sodium: 55 } },
  { name: "Sweetcorn", note: "raw", aka: "corn", servingSize: 90, servingLabel: "1 ear (90 g)", per100: { kcal: 86, protein: 3.27, fat: 1.35, carbs: 18.7, sodium: 15 } },
  { name: "Tea", note: "black, no milk", servingSize: 237, servingLabel: "1 cup (237 g)", per100: { kcal: 1, protein: 0, fat: 0, carbs: 0.3, sodium: 3 } },
  { name: "Tilapia", note: "raw", servingSize: 115, servingLabel: "1 fillet (115 g)", per100: { kcal: 96, protein: 20.1, fat: 1.7, carbs: 0, sodium: 52 } },
  { name: "Tofu", note: "firm", servingSize: 126, servingLabel: "1/2 cup (126 g)", per100: { kcal: 144, protein: 17.3, fat: 8.72, carbs: 2.78, sodium: 14 } },
  { name: "Tomato", note: "raw", servingSize: 123, servingLabel: "1 medium (123 g)", per100: { kcal: 18, protein: 0.88, fat: 0.2, carbs: 3.89, sodium: 5 } },
  { name: "Tuna", note: "canned in water", servingSize: 142, servingLabel: "1 can (142 g)", per100: { kcal: 116, protein: 25.5, fat: 0.82, carbs: 0, sodium: 50 } },
  { name: "Turkey breast", note: "raw", servingSize: 100, servingLabel: "100 g", per100: { kcal: 114, protein: 23.7, fat: 1.48, carbs: 0.14, sodium: 113 } },
  { name: "Walnuts", servingSize: 28, servingLabel: "1 oz (28 g)", per100: { kcal: 654, protein: 15.2, fat: 65.2, carbs: 13.7, sodium: 2 } },
  { name: "Watermelon", servingSize: 152, servingLabel: "1 cup (152 g)", per100: { kcal: 30, protein: 0.61, fat: 0.15, carbs: 7.55, sodium: 1 } },
  { name: "White bread", servingSize: 28, servingLabel: "1 slice (28 g)", per100: { kcal: 238, protein: 10.7, fat: 2.15, carbs: 43.9, sodium: 478 } },
  { name: "White rice", note: "cooked", servingSize: 158, servingLabel: "1 cup (158 g)", per100: { kcal: 130, protein: 2.69, fat: 0.28, carbs: 28.2, sodium: 1 } },
  { name: "Wholemeal bread", aka: "whole wheat wholewheat brown", servingSize: 28, servingLabel: "1 slice (28 g)", per100: { kcal: 252, protein: 12.4, fat: 3.5, carbs: 42.7, sodium: 455 } },
  { name: "Wholemeal pasta", note: "cooked", aka: "whole wheat", servingSize: 140, servingLabel: "1 cup (140 g)", per100: { kcal: 149, protein: 5.99, fat: 1.71, carbs: 30.1, sodium: 4 } },
  { name: "Yoghurt", note: "plain", aka: "yogurt", servingSize: 245, servingLabel: "1 cup (245 g)", per100: { kcal: 61, protein: 3.47, fat: 3.25, carbs: 4.66, sodium: 46 } },
]
