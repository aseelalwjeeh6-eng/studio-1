import data from './gifts.json';

export type GiftCategory = 'economic' | 'medium' | 'luxury' | 'legendary' | 'exclusive';

export interface Gift {
  id: string;
  name: string;
  cost: number;
  category: GiftCategory;
  message: string;
  emoji: string;
  animation: string;
  soundUrl?: string;
}

export interface CoinPackage {
    id: string;
    coins: number;
    price: number;
    description: string;
    saving?: string;
}

export const Gifts: Gift[] = data.gifts;
export const CoinPackages: CoinPackage[] = data.coinPackages;
