import React from 'react';
import { Pressable as NativePressable, type PressableProps } from 'react-native';
import { useBestpad } from '../context';

/** Consistent tap feedback for all tappable surfaces, using the Settings preference. */
export function Pressable({ onPress, ...props }: PressableProps) {
  const { tapFeedback } = useBestpad();
  return <NativePressable {...props} onPress={onPress ? event => {
    if (props.accessibilityRole !== 'none') tapFeedback();
    onPress(event);
  } : undefined} />;
}
