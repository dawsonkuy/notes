import React from 'react';
import { Pressable as NativePressable, type PressableProps } from 'react-native';
import { useBestpad } from '../context';

/** Consistent tap feedback for all tappable surfaces, using the Settings preference. */
export function Pressable({ onPress, haptic = true, ...props }: PressableProps & { haptic?: boolean }) {
  const { tapFeedback } = useBestpad();
  return <NativePressable {...props} onPress={onPress ? event => {
    if (haptic && props.accessibilityRole !== 'none') tapFeedback();
    onPress(event);
  } : undefined} />;
}
