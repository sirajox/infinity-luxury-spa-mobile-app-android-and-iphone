import {
  AlertCircle, Bath, Bell, Calendar, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock,
  CreditCard, Download, Droplet, Eye, EyeOff, FileText, Flower2, Heart, HelpCircle, Hourglass, House, Image as ImageIcon,
  Layers, Lock, LogOut, Mail, MapPin, MessageCircle, Minus, Navigation, Package, Pencil, Phone, Plus, RefreshCw, Search,
  Share2, ShieldCheck, ShoppingBag, SlidersHorizontal, Smile, Sparkles, Star, Syringe, Tag, Trash2, Truck, User, Wallet,
  WifiOff, X, Wifi,
  type LucideIcon,
} from 'lucide-react-native';
import { colors } from '@/theme';

const icons = {
  alert: AlertCircle, bath: Bath, bell: Bell, calendar: Calendar, calendarDays: CalendarDays, check: Check,
  checkCircle: CheckCircle2, chevronDown: ChevronDown, chevronLeft: ChevronLeft, chevronRight: ChevronRight, clock: Clock,
  card: CreditCard, download: Download, drop: Droplet, eye: Eye, eyeOff: EyeOff, file: FileText, lotus: Flower2, heart: Heart,
  help: HelpCircle, hourglass: Hourglass, home: House, image: ImageIcon, stones: Layers, lock: Lock, logout: LogOut, mail: Mail,
  pin: MapPin, chat: MessageCircle, minus: Minus, directions: Navigation, package: Package, edit: Pencil, phone: Phone, plus: Plus,
  refresh: RefreshCw, search: Search, share: Share2, shield: ShieldCheck, bag: ShoppingBag, sliders: SlidersHorizontal,
  face: Smile, sparkle: Sparkles, star: Star, drip: Syringe, tag: Tag, trash: Trash2, truck: Truck, user: User, wallet: Wallet,
  wifiOff: WifiOff, wifi: Wifi, close: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

/** Category icon keys stored in the database (service_categories.icon) resolve here, falling back to a sparkle. */
export function iconForKey(key: string | null | undefined): IconName {
  return key && key in icons ? (key as IconName) : 'sparkle';
}

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  filled?: boolean;
}

/** Thin-line icon set (lucide). One stroke weight everywhere keeps the visual language consistent. */
export function Icon({ name, size = 20, color = colors.black, strokeWidth = 1.5, filled = false }: IconProps) {
  const Cmp = icons[name];
  return <Cmp size={size} color={color} strokeWidth={strokeWidth} fill={filled ? color : 'none'} />;
}
