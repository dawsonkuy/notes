import React, { createContext, useContext, useLayoutEffect, useState } from 'react';
import { Animated, Easing, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import type { CellRendererProps } from '@react-native/virtualized-lists';
import type { TreeEntry } from '../organization';
export const LiftedRow = createContext<string | null>(null);
export function LibraryCell({ item, children, style, onLayout, onFocusCapture }: CellRendererProps<TreeEntry>) {
  const active = useContext(LiftedRow) === item.id;
  return <View onLayout={onLayout} onFocusCapture={onFocusCapture} style={[style, { zIndex: active ? 100 : 0, overflow: 'visible' }]}>{children}</View>;
}
export function AnimatedLibraryRow({ children, active, dragY, offset, reordering, rowRef, style }: { children: React.ReactNode; active: boolean; dragY: Animated.Value; offset: number; reordering: boolean; rowRef: (value: React.ComponentRef<typeof View> | null) => void; style: StyleProp<ViewStyle> }) {
  const [shift] = useState(() => new Animated.Value(0));
  useLayoutEffect(() => { if (!reordering) { shift.setValue(0); return; } const animation = Animated.timing(shift, { toValue: offset, duration: 170, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }); animation.start(); return () => animation.stop(); }, [offset, reordering, shift]);
  return <Animated.View ref={rowRef} style={[style, { transform: [{ translateY: active ? dragY : shift }], zIndex: active ? 100 : 0, opacity: 1, elevation: active ? 12 : 0, boxShadow: active ? '0px 8px 24px rgba(0,0,0,0.22)' : 'none' }]}>{children}</Animated.View>;
}
