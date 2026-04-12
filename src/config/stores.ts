// Global grocery store directory with coupon information per store

export interface StoreInfo {
  name: string;
  couponType: string; // How coupons work at this store
  couponTip: string; // Quick tip for using coupons
}

export interface StoreRegion {
  key: string;
  label: string;
  emoji: string;
  stores: StoreInfo[];
}

export const STORE_REGIONS: StoreRegion[] = [
  {
    key: 'ireland',
    label: 'Ireland',
    emoji: '🇮🇪',
    stores: [
      { name: 'Tesco', couponType: 'Clubcard', couponTip: 'Digital coupons via Tesco app or Clubcard vouchers. Scan Clubcard at checkout.' },
      { name: 'Dunnes Stores', couponType: 'In-store vouchers', couponTip: 'Paper vouchers printed at checkout. €10 off when you spend €50 promos.' },
      { name: 'SuperValu', couponType: 'Real Rewards', couponTip: 'Digital coupons in Real Rewards app. Points convert to money-off vouchers.' },
      { name: 'Aldi', couponType: 'Weekly offers', couponTip: 'No traditional coupons. Weekly Super 6 fruit/veg deals and Specialbuys.' },
      { name: 'Lidl', couponType: 'Lidl Plus', couponTip: 'Digital coupons in Lidl Plus app. Scratch cards and personalised offers.' },
      { name: 'Centra', couponType: 'In-store deals', couponTip: 'Meal deal combos and weekly promotions. No formal coupon system.' },
      { name: 'Spar', couponType: 'In-store offers', couponTip: 'Meal deals and weekly specials. Some stores accept manufacturer coupons.' },
      { name: 'M&S Food', couponType: 'Sparks Card', couponTip: 'M&S Sparks loyalty card with personalised offers and rewards.' },
      { name: 'Iceland', couponType: 'Bonus Card', couponTip: 'Bonus Card saves £1 for every £20 spent. In-app exclusive offers.' },
      { name: 'EuroSpar', couponType: 'In-store deals', couponTip: 'Weekly specials and multi-buy offers. Part of BWG/Spar group.' },
      { name: 'Londis', couponType: 'Local offers', couponTip: 'Individual store promotions. Some accept manufacturer coupons.' },
      { name: 'Mace', couponType: 'Local offers', couponTip: 'Individual store promotions and meal deal combos.' },
      { name: 'Dealz', couponType: 'Fixed pricing', couponTip: 'Fixed low prices, no coupon system. Occasional multi-buy offers.' },
    ],
  },
  {
    key: 'usa',
    label: 'United States',
    emoji: '🇺🇸',
    stores: [
      { name: 'Walmart', couponType: 'Walmart+/Catcher', couponTip: 'Walmart app coupons, rollback prices. Walmart+ members get extra savings.' },
      { name: 'Target', couponType: 'Target Circle', couponTip: 'Target Circle app offers. Stack manufacturer + Target coupons. 5% off with RedCard.' },
      { name: 'Costco', couponType: 'Member deals', couponTip: 'Monthly coupon book for members. Instant savings at register, no clipping needed.' },
      { name: 'Kroger', couponType: 'Digital coupons', couponTip: 'Load digital coupons to Kroger Plus card via app. Fuel points bonus.' },
      { name: 'Whole Foods', couponType: 'Prime deals', couponTip: 'Amazon Prime members get extra 10% off sale items. Digital app coupons.' },
      { name: "Trader Joe's", couponType: 'No coupons', couponTip: 'No coupons accepted. Low everyday prices, fearless flyer deals.' },
      { name: 'Publix', couponType: 'BOGO / paper', couponTip: 'Famous BOGO deals. Accepts manufacturer + store coupons, stacking allowed.' },
      { name: 'Safeway', couponType: 'Just for U', couponTip: 'Digital coupons via Just for U app. Clip and save to loyalty card.' },
      { name: "Sam's Club", couponType: 'Instant savings', couponTip: 'Monthly instant savings. Scan & Go app for easy checkout.' },
      { name: 'Meijer', couponType: 'mPerks', couponTip: 'Digital coupons via mPerks app. Accepts manufacturer coupons + mPerks together.' },
      { name: 'H-E-B', couponType: 'Digital coupons', couponTip: 'H-E-B app digital coupons. Combo Loco meal deals.' },
      { name: 'Wegmans', couponType: 'Digital coupons', couponTip: 'Wegmans app digital coupons. Accepts manufacturer coupons.' },
      { name: 'Aldi US', couponType: 'Weekly offers', couponTip: 'No coupons. Aldi Finds weekly deals and low everyday prices.' },
      { name: 'Lidl US', couponType: 'Lidl Plus', couponTip: 'Lidl Plus app digital coupons and weekly ad specials.' },
    ],
  },
  {
    key: 'uk',
    label: 'United Kingdom',
    emoji: '🇬🇧',
    stores: [
      { name: 'Tesco UK', couponType: 'Clubcard', couponTip: 'Clubcard prices in-store and online. Clubcard Plus subscription for extra savings.' },
      { name: 'Sainsbury\'s', couponType: 'Nectar', couponTip: 'Nectar card points and digital Nectar Prices offers via app.' },
      { name: 'Asda', couponType: 'Asda Rewards', couponTip: 'Asda Rewards app with Cashpot savings. Price Lock promise.' },
      { name: 'Morrisons', couponType: 'More Card', couponTip: 'Morrisons More Card points. Digital offers via app.' },
      { name: 'Waitrose', couponType: 'myWaitrose', couponTip: 'myWaitrose card with personalised vouchers and free coffee/tea.' },
      { name: 'Co-op UK', couponType: 'Membership', couponTip: 'Co-op membership gives 2p per £1 back on own-brand products.' },
      { name: 'Ocado', couponType: 'Smart Pass', couponTip: 'Smart Pass for free delivery. Regular promotional voucher codes.' },
    ],
  },
  {
    key: 'europe',
    label: 'Europe',
    emoji: '🇪🇺',
    stores: [
      { name: 'Carrefour', couponType: 'Digital coupons', couponTip: 'Carrefour app coupons. Loyalty card points across France, Spain, Italy.' },
      { name: 'Albert Heijn', couponType: 'Bonus Card', couponTip: 'AH Bonus card weekly offers. App-based personal discounts (Netherlands).' },
      { name: 'REWE', couponType: 'REWE app', couponTip: 'REWE app coupons and Payback points. Weekly flyer deals (Germany).' },
      { name: 'Edeka', couponType: 'Edeka app', couponTip: 'Edeka app coupons. Regional promotions vary by franchise (Germany).' },
      { name: 'Mercadona', couponType: 'Low prices', couponTip: 'No coupon system. Everyday low price strategy (Spain).' },
      { name: 'Esselunga', couponType: 'Fidaty Card', couponTip: 'Fidaty loyalty card with points and personalised offers (Italy).' },
      { name: 'Intermarché', couponType: 'Loyalty card', couponTip: 'Loyalty card with automatic discounts and app coupons (France).' },
      { name: 'Migros', couponType: 'Cumulus', couponTip: 'Cumulus card loyalty points. Digital coupons in Migros app (Switzerland).' },
    ],
  },
  {
    key: 'asia',
    label: 'Asia & Oceania',
    emoji: '🌏',
    stores: [
      { name: 'Woolworths AU', couponType: 'Everyday Rewards', couponTip: 'Everyday Rewards card points. Digital offers via app (Australia).' },
      { name: 'Coles', couponType: 'Flybuys', couponTip: 'Flybuys card points. Coles app digital offers (Australia).' },
      { name: 'AEON', couponType: 'WAON Card', couponTip: 'WAON electronic money card with points. App coupons (Japan).' },
      { name: 'FairPrice', couponType: 'Link Card', couponTip: 'FairPrice Link card with rebates and digital coupons (Singapore).' },
      { name: 'Big Bazaar', couponType: 'Smart Search', couponTip: 'Future Pay wallet offers and seasonal sales (India).' },
      { name: 'Lotte Mart', couponType: 'L.Point', couponTip: 'L.Point loyalty program across Lotte stores (South Korea).' },
      { name: 'Countdown NZ', couponType: 'Onecard', couponTip: 'Onecard loyalty points and Everyday Rewards (New Zealand).' },
      { name: 'PAK\'nSAVE', couponType: 'Low prices', couponTip: 'No formal coupon system. Lowest food prices guarantee (New Zealand).' },
    ],
  },
  {
    key: 'americas',
    label: 'Latin America & Canada',
    emoji: '🌎',
    stores: [
      { name: 'Loblaws', couponType: 'PC Optimum', couponTip: 'PC Optimum points across Loblaws, No Frills, Shoppers. App offers (Canada).' },
      { name: 'Metro CA', couponType: 'metro&moi', couponTip: 'metro&moi rewards program with personalised offers (Canada).' },
      { name: 'Oxxo', couponType: 'Spin Premia', couponTip: 'Spin Premia loyalty points. Digital coupons via app (Mexico).' },
      { name: 'Éxito', couponType: 'Puntos Colombia', couponTip: 'Puntos Colombia loyalty across retail stores (Colombia).' },
    ],
  },
  {
    key: 'africa',
    label: 'Africa & Middle East',
    emoji: '🌍',
    stores: [
      { name: 'Shoprite', couponType: 'Xtra Savings', couponTip: 'Xtra Savings card with personalised deals. App coupons (South Africa).' },
      { name: 'Pick n Pay', couponType: 'Smart Shopper', couponTip: 'Smart Shopper card points. Digital vouchers via app (South Africa).' },
      { name: 'Carrefour ME', couponType: 'MAF Card', couponTip: 'SHARE loyalty card. App-based offers (UAE, Saudi, Egypt).' },
      { name: 'Spinneys', couponType: 'Loyalty points', couponTip: 'In-app loyalty points and seasonal promotions (UAE, Lebanon).' },
    ],
  },
];

/** Flat list of all store names for quick lookup */
export const ALL_STORE_NAMES = STORE_REGIONS.flatMap(r => r.stores.map(s => s.name));

/** Find store info by name (case-insensitive) */
export function findStoreInfo(name: string): StoreInfo | undefined {
  const lower = name.toLowerCase();
  for (const region of STORE_REGIONS) {
    const found = region.stores.find(s => s.name.toLowerCase() === lower);
    if (found) return found;
  }
  return undefined;
}

/** Find which region a store belongs to */
export function findStoreRegion(name: string): StoreRegion | undefined {
  const lower = name.toLowerCase();
  return STORE_REGIONS.find(r => r.stores.some(s => s.name.toLowerCase() === lower));
}
