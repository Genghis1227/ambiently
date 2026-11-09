import React, { useState } from 'react';
import { getProfileInitials } from '../../utils/avatarCompressor';

export interface HouseholdAvatarProfileLike {
  name: string;
  color: string;
  avatarDataUrl?: string;
  avatarUrl?: string;
  emoji?: string;
}

export interface HouseholdAvatarProps {
  profile: HouseholdAvatarProfileLike;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showRing?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<HouseholdAvatarProps['size']>, string> = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
};

export const HouseholdAvatar: React.FC<HouseholdAvatarProps> = ({
  profile,
  size = 'md',
  className = '',
  showRing = true,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const src = profile.avatarDataUrl || profile.avatarUrl;
  const sizeClass = SIZE_CLASSES[size];

  if (src && !imgFailed) {
    return (
      <span
        className={`${sizeClass} shrink-0 rounded-full overflow-hidden inline-flex items-center justify-center select-none ${className}`}
        style={{
          backgroundColor: profile.color || '#6b8f71',
          boxShadow: showRing ? `0 0 0 2px ${profile.color || '#6b8f71'}66` : undefined,
        }}
        title={profile.name}
      >
        <img
          src={src}
          alt={profile.name}
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`${sizeClass} shrink-0 rounded-full inline-flex items-center justify-center font-semibold text-white tracking-tight select-none ${className}`}
      style={{
        backgroundColor: profile.color || '#6b8f71',
        boxShadow: showRing ? `0 0 0 2px ${profile.color || '#6b8f71'}55` : undefined,
      }}
      title={profile.name}
    >
      {profile.emoji ? profile.emoji : getProfileInitials(profile.name)}
    </span>
  );
};
