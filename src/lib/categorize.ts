// Lightweight keyword-based auto-categorization for grocery items.
// Used when a category isn't explicitly chosen by the user.

const RULES: Array<{ category: string; keywords: string[] }> = [
  {
    category: 'Fruits',
    keywords: [
      'apple', 'banana', 'orange', 'grape', 'strawberr', 'blueberr', 'raspberr',
      'blackberr', 'pear', 'peach', 'plum', 'mango', 'pineapple', 'watermelon',
      'melon', 'kiwi', 'lemon', 'lime', 'cherr', 'apricot', 'avocado', 'pomegranate',
      'papaya', 'fig', 'date', 'coconut', 'berry', 'fruit',
    ],
  },
  {
    category: 'Vegetables',
    keywords: [
      'tomato', 'potato', 'onion', 'garlic', 'ginger', 'carrot', 'broccoli',
      'cauliflower', 'cabbage', 'lettuce', 'spinach', 'kale', 'cucumber',
      'pepper', 'capsicum', 'chilli', 'chili', 'pumpkin', 'squash', 'zucchini',
      'aubergine', 'eggplant', 'celery', 'leek', 'mushroom', 'corn', 'bean',
      'pea', 'asparagus', 'radish', 'beet', 'turnip', 'okra', 'sprout', 'salad',
      'veg',
    ],
  },
  {
    category: 'Dairy',
    keywords: [
      'milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'curd', 'paneer',
      'ghee', 'kefir', 'custard', 'mozzarella', 'cheddar', 'feta', 'parmesan',
      'ricotta', 'brie',
    ],
  },
  {
    category: 'Grains',
    keywords: [
      'rice', 'bread', 'pasta', 'noodle', 'flour', 'oat', 'cereal', 'wheat',
      'quinoa', 'barley', 'rye', 'bagel', 'tortilla', 'roti', 'naan', 'chapati',
      'bun', 'roll', 'cracker', 'cornflake', 'muesli', 'granola',
    ],
  },
  {
    category: 'Snacks',
    keywords: [
      'chip', 'crisp', 'cookie', 'biscuit', 'chocolate', 'candy', 'sweet',
      'pretzel', 'popcorn', 'nut', 'almond', 'cashew', 'peanut', 'pistachio',
      'walnut', 'bar', 'wafer', 'cake', 'pastry', 'doughnut', 'donut',
    ],
  },
  {
    category: 'Drinks',
    keywords: [
      'water', 'juice', 'soda', 'cola', 'coke', 'pepsi', 'sprite', 'fanta',
      'beer', 'wine', 'whisky', 'vodka', 'rum', 'gin', 'coffee', 'tea',
      'lemonade', 'smoothie', 'drink', 'beverage', 'energy', 'kombucha',
    ],
  },
  {
    category: 'Meat',
    keywords: [
      'chicken', 'beef', 'pork', 'lamb', 'mutton', 'turkey', 'duck', 'bacon',
      'sausage', 'ham', 'salami', 'steak', 'mince', 'fish', 'salmon', 'tuna',
      'prawn', 'shrimp', 'crab', 'lobster', 'meat', 'egg',
    ],
  },
  {
    category: 'Spices',
    keywords: [
      'salt', 'pepper', 'cumin', 'coriander', 'turmeric', 'paprika', 'cinnamon',
      'cardamom', 'clove', 'nutmeg', 'oregano', 'basil', 'thyme', 'rosemary',
      'bay', 'masala', 'curry powder', 'chilli powder', 'spice', 'seasoning',
    ],
  },
  {
    category: 'Frozen',
    keywords: [
      'frozen', 'ice cream', 'icecream', 'gelato', 'sorbet', 'popsicle',
    ],
  },
  {
    category: 'Sauces',
    keywords: [
      'sauce', 'ketchup', 'mayo', 'mayonnaise', 'mustard', 'vinegar', 'oil',
      'soy', 'tabasco', 'sriracha', 'salsa', 'pesto', 'paste', 'jam', 'jelly',
      'honey', 'syrup', 'dressing', 'gravy', 'chutney', 'pickle',
    ],
  },
];

export function guessCategory(name: string, fallback = 'Other'): string {
  if (!name) return fallback;
  const n = name.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some(k => n.includes(k))) return rule.category;
  }
  return fallback;
}
