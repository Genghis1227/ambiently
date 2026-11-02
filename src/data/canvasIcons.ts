import {
  Pin,
  Image,
  Home,
  Calendar,
  Coffee,
  Heart,
  Star,
  Music,
  Sun,
  CheckSquare,
  Sparkles,
  Smile,
  Tv,
  Folder,
  Clock,
  LayoutGrid,
} from 'lucide-react';

export interface CanvasIconOption {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const CANVAS_ICONS: CanvasIconOption[] = [
  { id: 'Pin', label: 'Pin', icon: Pin },
  { id: 'Image', label: 'Photos', icon: Image },
  { id: 'Home', label: 'Home', icon: Home },
  { id: 'Calendar', label: 'Calendar', icon: Calendar },
  { id: 'Coffee', label: 'Coffee', icon: Coffee },
  { id: 'Heart', label: 'Heart', icon: Heart },
  { id: 'Star', label: 'Star', icon: Star },
  { id: 'Music', label: 'Music', icon: Music },
  { id: 'Sun', label: 'Sun', icon: Sun },
  { id: 'CheckSquare', label: 'Tasks', icon: CheckSquare },
  { id: 'Sparkles', label: 'Sparkles', icon: Sparkles },
  { id: 'Smile', label: 'Smile', icon: Smile },
  { id: 'Tv', label: 'Display', icon: Tv },
  { id: 'Folder', label: 'Folder', icon: Folder },
  { id: 'Clock', label: 'Clock', icon: Clock },
  { id: 'LayoutGrid', label: 'Grid', icon: LayoutGrid },
];
