import React, { useState } from 'react';
import { useProfileStore } from '../../stores/useProfileStore';
import { resolveProfileColorHex, type HouseholdProfile } from '../../types/profiles';
import { getProfileInitials } from '../../utils/avatarCompressor';

export type ProfileAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface ProfileAvatarLike {
  id?: string;
  name: string;
  color: string;
  avatarDataUrl?: string;
  avatarUrl?: string;
  emoji?: string;
  icon?: string;
}

export interface ProfileAvatarProps {
  profileId?: string;
  profile?: ProfileAvatarLike | HouseholdProfile | null;
  size?: ProfileAvatarSize;
  showName?: boolean;
  showRing?: boolean;
  className?: string;
  nameClassName?: string;
}

const AVATAR_SIZE_CLASSES: Record<ProfileAvatarSize, string> = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
};

const NAME_SIZE_CLASSES: Record<ProfileAvatarSize, string> = {
  xs: 'text-xs gap-1.5',
  sm: 'text-xs gap-1.5',
  md: 'text-sm gap-2',
  lg: 'text-base gap-2.5',
  xl: 'text-lg gap-3',
};

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  profileId,
  profile,
  size = 'md',
  showName = false,
  showRing = true,
  className = '',
  nameClassName = '',
}) => {
  const profiles = useProfileStore((s) => s.profiles);
  const resolvedProfile: ProfileAvatarLike = React.useMemo(() => {
    if (profile) return profile;
    if (profileId) {
      const found = profiles.find((p) => p.id === profileId);
      if (found) return found;
    }
    return {
      id: profileId,
      name: '?',
      color: '#6b8f71',
    };
  }, [profile, profileId, profiles]);

  const src =
    resolvedProfile.avatarDataUrl ||
    (resolvedProfile as ProfileAvatarLike).avatarUrl ||
    undefined;

  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imgFailed = Boolean(src && failedSrc === src);

  const hexColor = resolveProfileColorHex(resolvedProfile.color);
  const sizeClass = AVATAR_SIZE_CLASSES[size];
  const ringStyle: React.CSSProperties = showRing
    ? {
        backgroundColor: hexColor,
        boxShadow: `0 0 0 2px ${hexColor}66`,
        border: `1px solid ${hexColor}88`,
      }
    : {
        backgroundColor: hexColor,
      };

  const badge =
    src && !imgFailed ? (
      <span
        className={`${sizeClass} shrink-0 rounded-full overflow-hidden inline-flex items-center justify-center select-none ${!showName ? className : ''}`}
        style={ringStyle}
        title={resolvedProfile.name}
      >
        <img
          src={src}
          alt={resolvedProfile.name}
          className="w-full h-full object-cover"
          onError={() => src && setFailedSrc(src)}
        />
      </span>
    ) : (
      <span
        className={`${sizeClass} shrink-0 rounded-full inline-flex items-center justify-center font-semibold text-white tracking-tight select-none ${!showName ? className : ''}`}
        style={ringStyle}
        title={resolvedProfile.name}
      >
        {resolvedProfile.emoji ||
          resolvedProfile.icon ||
          getProfileInitials(resolvedProfile.name)}
      </span>
    );

  if (!showName) {
    return badge;
  }

  return (
    <span
      className={`inline-flex items-center min-w-0 ${NAME_SIZE_CLASSES[size]} ${className}`}
    >
      {badge}
      <span className={`font-medium truncate ${nameClassName}`}>
        {resolvedProfile.name}
      </span>
    </span>
  );
};

export default ProfileAvatar;
