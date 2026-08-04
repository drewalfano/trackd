/**
 * Which foods are staples, what they are called, and what one portion is.
 *
 * This file is the judgement; `build-staples.mjs` is the arithmetic. Nothing
 * here carries a macro figure — those all come from USDA FoodData Central at
 * build time, so a number in the app can always be traced to a row in the
 * dataset rather than to somebody's memory of one.
 *
 * ---
 *
 * **The selection rule: a food someone would search for by a bare noun.**
 * Egg, banana, rice, chicken breast, olive oil. If the honest search for it
 * includes a brand, it is Open Food Facts' job and does not belong here. The
 * rule matters more than the count — a table that grows past what it admits
 * stops being staples and becomes a second, worse product database.
 *
 * **Raw or cooked follows how it is bought and eaten.** Meat and fish are raw,
 * because that is what a pack states and what a scale weighs. Rice, pasta,
 * beans and lentils are cooked, because nobody eats them dry and the dry
 * figure is four times the cooked one — the single easiest way to log four
 * times the calories you ate.
 *
 * ---
 *
 * Fields:
 *   q        search terms; every one must appear in the USDA description
 *   not      terms that must NOT appear, to fend off near-misses
 *   fdcId    pin, when the query resolves to the wrong row. Wins over q.
 *   name     what it is called in the app
 *   note     the disambiguator, shown after a comma
 *   aka      searched, never shown. The word someone types.
 *   portion  a USDA portion modifier to take the gram weight from
 *   g        an explicit gram weight, when the portion is a judgement
 *   label    the serving as words. Generated from the portion when omitted.
 */

export const MANIFEST = [
  /* ------------------------------------------------------- eggs and dairy */
  { q: 'egg whole raw fresh', name: 'Egg', portion: 'large', label: '1 large egg (50 g)' },
  { q: 'egg white raw fresh', name: 'Egg white', portion: 'large', label: '1 large white (33 g)' },
  { q: 'egg yolk raw fresh', name: 'Egg yolk', portion: 'large', label: '1 large yolk (17 g)' },
  { q: 'milk whole 3.25', not: 'chocolate', name: 'Milk', note: 'whole', g: 244, label: '1 cup (244 g)' },
  { q: 'milk nonfat fluid protein fortified', name: 'Milk', note: 'skim', aka: 'nonfat', g: 245, label: '1 cup (245 g)' },
  { q: 'milk reduced fat fluid 2%', not: 'chocolate', name: 'Milk', note: '2%', g: 244, label: '1 cup (244 g)' },
  { fdcId: 170894, name: 'Greek yoghurt', note: 'nonfat', aka: 'yogurt', g: 170, label: '1 pot (170 g)' },
  { q: 'yogurt greek plain whole milk', name: 'Greek yoghurt', note: 'whole milk', aka: 'yogurt', g: 170, label: '1 pot (170 g)' },
  { q: 'yogurt plain whole milk', not: 'greek', name: 'Yoghurt', note: 'plain', aka: 'yogurt', g: 245, label: '1 cup (245 g)' },
  { fdcId: 170899, name: 'Cheddar', aka: 'cheese', g: 28, label: '1 oz (28 g)' },
  { q: 'cheese mozzarella whole milk', name: 'Mozzarella', aka: 'cheese', g: 28, label: '1 oz (28 g)' },
  { q: 'cheese parmesan grated', not: 'low', name: 'Parmesan', aka: 'cheese', g: 5, label: '1 tbsp (5 g)' },
  { q: 'cheese feta', name: 'Feta', aka: 'cheese', g: 28, label: '1 oz (28 g)' },
  { q: 'cheese cottage lowfat 2%', name: 'Cottage cheese', note: '2%', g: 226, label: '1 cup (226 g)' },
  { q: 'cream cheese', not: 'low fat', name: 'Cream cheese', g: 14, label: '1 tbsp (14 g)' },
  { q: 'butter salted', not: 'whipped light oil', name: 'Butter', g: 14, label: '1 tbsp (14 g)' },
  { q: 'cream heavy whipping', name: 'Double cream', aka: 'heavy cream whipping', g: 15, label: '1 tbsp (15 g)' },

  /* ---------------------------------------------------------- meat & fish */
  { fdcId: 171077, name: 'Chicken breast', note: 'raw', g: 174, label: '1 breast (174 g)' },
  { q: 'chicken broilers fryers thigh meat only raw', name: 'Chicken thigh', note: 'raw', g: 100, label: '100 g' },
  { q: 'chicken broilers fryers drumstick meat only raw', name: 'Chicken drumstick', note: 'raw', g: 100, label: '100 g' },
  { q: 'turkey breast meat only raw', name: 'Turkey breast', note: 'raw', g: 100, label: '100 g' },
  { fdcId: 171796, name: 'Ground beef', note: '85% lean, raw', aka: 'mince minced hamburger', g: 113, label: '4 oz (113 g)' },
  { q: 'beef ground 93% lean 7% fat raw', name: 'Ground beef', note: '93% lean, raw', aka: 'mince minced', g: 113, label: '4 oz (113 g)' },
  { fdcId: 174055, name: 'Sirloin steak', note: 'raw', aka: 'beef', g: 113, label: '4 oz (113 g)' },
  { q: 'pork fresh loin tenderloin separable lean only raw', name: 'Pork tenderloin', note: 'raw', g: 113, label: '4 oz (113 g)' },
  { q: 'pork cured bacon cooked', not: 'canadian turkey', name: 'Bacon', note: 'cooked', g: 8, label: '1 slice (8 g)' },
  { fdcId: 171631, name: 'Pork sausage', note: 'raw', g: 50, label: '1 sausage (50 g)' },
  { fdcId: 172491, name: 'Lamb loin', note: 'raw', g: 113, label: '4 oz (113 g)' },
  { q: 'fish salmon atlantic farmed raw', name: 'Salmon', note: 'raw', g: 170, label: '1 fillet (170 g)' },
  { q: 'fish tuna light canned water drained solids', name: 'Tuna', note: 'canned in water', g: 142, label: '1 can (142 g)' },
  { q: 'fish cod atlantic raw', name: 'Cod', note: 'raw', g: 115, label: '1 fillet (115 g)' },
  { q: 'fish tilapia raw', name: 'Tilapia', note: 'raw', g: 115, label: '1 fillet (115 g)' },
  { q: 'crustaceans shrimp mixed species raw', name: 'Prawns', note: 'raw', aka: 'shrimp', g: 100, label: '100 g' },
  { q: 'mollusks scallop mixed species raw', name: 'Scallops', note: 'raw', g: 100, label: '100 g' },

  /* --------------------------------------------------- grains and starches */
  { fdcId: 168878, name: 'White rice', note: 'cooked', g: 158, label: '1 cup (158 g)' },
  { q: 'rice brown long-grain cooked', name: 'Brown rice', note: 'cooked', g: 195, label: '1 cup (195 g)' },
  { fdcId: 173904, name: 'Rolled oats', note: 'dry', aka: 'oatmeal porridge', g: 40, label: '40 g dry' },
  { q: 'quinoa cooked', name: 'Quinoa', note: 'cooked', g: 185, label: '1 cup (185 g)' },
  { q: 'pasta cooked enriched without added salt', name: 'Pasta', note: 'cooked', aka: 'spaghetti', g: 140, label: '1 cup (140 g)' },
  { q: 'pasta whole-wheat cooked', name: 'Wholemeal pasta', note: 'cooked', aka: 'whole wheat', g: 140, label: '1 cup (140 g)' },
  { q: 'couscous cooked', name: 'Couscous', note: 'cooked', g: 157, label: '1 cup (157 g)' },
  { fdcId: 167532, name: 'White bread', g: 28, label: '1 slice (28 g)' },
  { q: 'bread whole-wheat commercially prepared', not: 'toasted', name: 'Wholemeal bread', aka: 'whole wheat wholewheat brown', g: 28, label: '1 slice (28 g)' },
  { q: 'english muffins plain enriched', not: 'toasted', name: 'English muffin', g: 57, label: '1 muffin (57 g)' },
  { q: 'tortillas ready-to-bake or -fry flour', name: 'Flour tortilla', g: 45, label: '1 tortilla (45 g)' },
  { q: 'potatoes flesh and skin raw', name: 'Potato', note: 'raw', g: 213, label: '1 medium (213 g)' },
  { q: 'sweet potato raw unprepared', name: 'Sweet potato', note: 'raw', aka: 'yam', g: 130, label: '1 medium (130 g)' },
  { q: 'corn sweet yellow raw', name: 'Sweetcorn', note: 'raw', aka: 'corn', g: 90, label: '1 ear (90 g)' },
  { q: 'wheat flour white all-purpose enriched bleached', name: 'Plain flour', aka: 'all purpose white flour', g: 125, label: '1 cup (125 g)' },

  /* ------------------------------------------------------------ vegetables */
  { q: 'broccoli raw', name: 'Broccoli', note: 'raw', g: 91, label: '1 cup (91 g)' },
  { q: 'spinach raw', name: 'Spinach', note: 'raw', g: 30, label: '1 cup (30 g)' },
  { q: 'kale raw', name: 'Kale', note: 'raw', g: 21, label: '1 cup (21 g)' },
  { q: 'lettuce cos or romaine raw', name: 'Romaine lettuce', aka: 'cos salad', g: 47, label: '1 cup (47 g)' },
  { q: 'carrots raw', name: 'Carrot', note: 'raw', g: 61, label: '1 medium (61 g)' },
  { q: 'tomatoes red ripe raw year round average', name: 'Tomato', note: 'raw', g: 123, label: '1 medium (123 g)' },
  { q: 'onions raw', name: 'Onion', note: 'raw', g: 110, label: '1 medium (110 g)' },
  { q: 'garlic raw', name: 'Garlic', note: 'raw', g: 3, label: '1 clove (3 g)' },
  { q: 'peppers sweet red raw', name: 'Red pepper', aka: 'bell capsicum', g: 119, label: '1 medium (119 g)' },
  { q: 'cucumber with peel raw', name: 'Cucumber', note: 'raw', g: 104, label: '1/2 cucumber (104 g)' },
  { q: 'mushrooms white raw', name: 'Mushrooms', note: 'raw', g: 70, label: '1 cup (70 g)' },
  { q: 'zucchini includes skin raw', name: 'Courgette', note: 'raw', aka: 'zucchini', g: 124, label: '1 medium (124 g)' },
  { q: 'eggplant raw', name: 'Aubergine', note: 'raw', aka: 'eggplant', g: 82, label: '1 cup (82 g)' },
  { q: 'cauliflower raw', name: 'Cauliflower', note: 'raw', g: 107, label: '1 cup (107 g)' },
  { q: 'cabbage raw', name: 'Cabbage', note: 'raw', g: 89, label: '1 cup (89 g)' },
  { q: 'asparagus raw', name: 'Asparagus', note: 'raw', g: 134, label: '1 cup (134 g)' },
  { q: 'green beans raw', name: 'Green beans', note: 'raw', g: 100, label: '1 cup (100 g)' },
  { q: 'peas green raw', name: 'Peas', note: 'raw', g: 145, label: '1 cup (145 g)' },
  { q: 'celery raw', name: 'Celery', note: 'raw', g: 40, label: '1 stalk (40 g)' },
  { q: 'squash winter butternut raw', name: 'Butternut squash', note: 'raw', g: 140, label: '1 cup (140 g)' },
  { q: 'beets raw', name: 'Beetroot', note: 'raw', aka: 'beets', g: 82, label: '1 beet (82 g)' },
  { q: 'avocados raw all commercial varieties', name: 'Avocado', g: 100, label: '1/2 avocado (100 g)' },

  /* ----------------------------------------------------------------- fruit */
  { q: 'bananas raw', name: 'Banana', g: 118, label: '1 medium (118 g)' },
  // SR Legacy has no generic apple WITH skin; golden delicious is the closest whole fruit.
  { fdcId: 168202, name: 'Apple', g: 182, label: '1 medium (182 g)' },
  { q: 'oranges raw all commercial varieties', name: 'Orange', g: 131, label: '1 medium (131 g)' },
  { q: 'strawberries raw', name: 'Strawberries', g: 152, label: '1 cup (152 g)' },
  { q: 'blueberries raw', name: 'Blueberries', g: 148, label: '1 cup (148 g)' },
  { q: 'raspberries raw', name: 'Raspberries', g: 123, label: '1 cup (123 g)' },
  { q: 'grapes red or green raw', name: 'Grapes', g: 151, label: '1 cup (151 g)' },
  { q: 'mangos raw', name: 'Mango', g: 165, label: '1 cup (165 g)' },
  { q: 'pineapple raw all varieties', name: 'Pineapple', g: 165, label: '1 cup (165 g)' },
  { q: 'watermelon raw', name: 'Watermelon', g: 152, label: '1 cup (152 g)' },
  { q: 'peaches raw', name: 'Peach', g: 150, label: '1 medium (150 g)' },
  { q: 'pears raw', name: 'Pear', g: 178, label: '1 medium (178 g)' },
  { q: 'plums raw', name: 'Plum', g: 66, label: '1 plum (66 g)' },
  { q: 'kiwifruit green raw', name: 'Kiwi', g: 76, label: '1 kiwi (76 g)' },
  { q: 'cherries sweet raw', name: 'Cherries', g: 154, label: '1 cup (154 g)' },
  { q: 'blackberries raw', name: 'Blackberries', g: 144, label: '1 cup (144 g)' },
  { q: 'lemons raw without peel', name: 'Lemon', g: 58, label: '1 lemon (58 g)' },
  { q: 'dates medjool', name: 'Dates', note: 'medjool', g: 24, label: '1 date (24 g)' },
  { q: 'raisins seedless', not: 'golden', name: 'Raisins', g: 43, label: '1/4 cup (43 g)' },

  /* --------------------------------------------- legumes, nuts and seeds */
  { q: 'beans black mature seeds cooked boiled without salt', name: 'Black beans', note: 'cooked', g: 172, label: '1 cup (172 g)' },
  { q: 'beans kidney red mature seeds cooked boiled without salt', name: 'Kidney beans', note: 'cooked', g: 177, label: '1 cup (177 g)' },
  { q: 'chickpeas garbanzo beans bengal gram mature seeds cooked boiled without salt', name: 'Chickpeas', note: 'cooked', aka: 'garbanzo', g: 164, label: '1 cup (164 g)' },
  { q: 'lentils mature seeds cooked boiled without salt', name: 'Lentils', note: 'cooked', g: 198, label: '1 cup (198 g)' },
  { q: 'beans baked canned plain or vegetarian', name: 'Baked beans', g: 254, label: '1 cup (254 g)' },
  { fdcId: 169283, name: 'Edamame', aka: 'soybeans', g: 155, label: '1 cup (155 g)' },
  { q: 'tofu raw firm prepared with calcium sulfate', name: 'Tofu', note: 'firm', g: 126, label: '1/2 cup (126 g)' },
  { q: 'nuts almonds', not: 'blanched dry roasted oil butter honey', name: 'Almonds', g: 28, label: '1 oz (28 g)' },
  { q: 'nuts walnuts english', name: 'Walnuts', g: 28, label: '1 oz (28 g)' },
  { q: 'nuts cashew nuts raw', name: 'Cashews', g: 28, label: '1 oz (28 g)' },
  { q: 'nuts pistachio nuts raw', name: 'Pistachios', g: 28, label: '1 oz (28 g)' },
  { q: 'nuts pecans', not: 'oil dry roasted', name: 'Pecans', g: 28, label: '1 oz (28 g)' },
  { q: 'peanuts all types raw', name: 'Peanuts', g: 28, label: '1 oz (28 g)' },
  { q: 'peanut butter smooth style without salt', name: 'Peanut butter', g: 32, label: '2 tbsp (32 g)' },
  { q: 'seeds chia seeds dried', name: 'Chia seeds', g: 28, label: '1 oz (28 g)' },
  { q: 'seeds sunflower seed kernels dried', name: 'Sunflower seeds', g: 28, label: '1 oz (28 g)' },
  { q: 'seeds pumpkin and squash seed kernels dried', name: 'Pumpkin seeds', g: 28, label: '1 oz (28 g)' },

  /* ------------------------------------------------------- fats and sugars */
  { q: 'oil olive salad or cooking', name: 'Olive oil', g: 13.5, label: '1 tbsp (13.5 g)' },
  { q: 'oil coconut', name: 'Coconut oil', g: 13.6, label: '1 tbsp (13.6 g)' },
  { fdcId: 171025, name: 'Sunflower oil', g: 13.6, label: '1 tbsp (13.6 g)' },
  { q: 'sugars granulated', name: 'Sugar', aka: 'granulated caster white', g: 4, label: '1 tsp (4 g)' },
  { q: 'honey', name: 'Honey', g: 21, label: '1 tbsp (21 g)' },
  { q: 'syrups maple', name: 'Maple syrup', g: 20, label: '1 tbsp (20 g)' },
  { q: 'salt table', name: 'Salt', g: 6, label: '1 tsp (6 g)' },

  /* ---------------------------------------------------------------- drinks */
  { q: 'beverages coffee brewed prepared with tap water', not: 'decaffeinated espresso', name: 'Coffee', note: 'black', g: 237, label: '1 cup (237 g)' },
  { q: 'beverages tea brewed prepared with tap water', not: 'green herb decaffeinated instant', name: 'Tea', note: 'black, no milk', g: 237, label: '1 cup (237 g)' },
  { q: 'beverages orange juice', not: 'concentrate drink', name: 'Orange juice', g: 248, label: '1 cup (248 g)' },
  { q: 'beverages almond milk unsweetened', name: 'Almond milk', note: 'unsweetened', g: 240, label: '1 cup (240 g)' },
]
