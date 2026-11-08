import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, PanResponder, Text, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { fromHSV, toHSV, type HSV } from '../appearance';
import { useBestpad } from '../context';
import { IconButton, ui } from './ui';
const SIZE = 220, R = SIZE / 2;
const point = (angle: number) => [R + Math.sin(angle * Math.PI / 180) * R, R - Math.cos(angle * Math.PI / 180) * R];
export function ColorEditor({ value, label, onChange, onClose }: { value: string; label: string; onChange: (color: string) => void; onClose: () => void }) {
  const { colors } = useBestpad(); const [hsv, setHSV] = useState(() => toHSV(value)); const [hex, setHex] = useState(value);
  const latest = useRef({ hsv, onChange }); 
  useEffect(() => { latest.current = { hsv, onChange }; }, [hsv, onChange]);
  const origin = useRef({ x: 0, y: 0 });
  const [source, setSource] = useState(value);
  if (source !== value) { setSource(value); setHex(value.toUpperCase()); if (value.toLowerCase() !== fromHSV(hsv).toLowerCase()) setHSV(toHSV(value)); }
  function set(next: HSV) { setHSV(next); latest.current.hsv = next; latest.current.onChange(fromHSV(next)); }
  const pan = useMemo(() => {
    const update = (x: number, y: number) => { const dx = x - R, dy = y - R; const next = { ...latest.current.hsv, h: (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360, s: Math.min(1, Math.hypot(dx, dy) / R) }; setHSV(next); latest.current.hsv = next; latest.current.onChange(fromHSV(next)); };
    // PanResponder registers these imperative callbacks; it does not call them during render.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({ onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, onPanResponderGrant: event => { const { locationX, locationY, pageX, pageY } = event.nativeEvent; origin.current = { x: pageX - locationX, y: pageY - locationY }; update(locationX, locationY); }, onPanResponderMove: (_event, gesture) => update(gesture.moveX - origin.current.x, gesture.moveY - origin.current.y) });
  }, []);
  const sectors = useMemo(() => Array.from({ length: 72 }, (_, i) => { const start = point(i * 5), end = point((i + 1) * 5 + .1); return <Path key={i} d={`M${R},${R} L${start[0]},${start[1]} A${R},${R} 0 0 1 ${end[0]},${end[1]} Z`} fill={fromHSV({ h: i * 5, s: 1, v: 1 })} />; }), []);
  const marker = [R + Math.sin(hsv.h * Math.PI / 180) * hsv.s * R, R - Math.cos(hsv.h * Math.PI / 180) * hsv.s * R];
  function commitHex() { if (/^#[0-9a-f]{6}$/i.test(hex)) onChange(hex.toLowerCase()); else { setHex(value.toUpperCase()); Alert.alert('Invalid color', 'Use six hexadecimal digits, such as #112233.'); } }
  return <View style={{ padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 17, backgroundColor: colors.secondary, marginTop: 14 }}>
    <View style={[ui.row, { justifyContent: 'space-between', marginBottom: 14 }]}><Text style={{ color: colors.font, fontWeight: '600' }}>{label} color</Text><IconButton name="close" label="Close color picker" onPress={onClose} /></View>
    <View {...pan.panHandlers} accessibilityLabel={`${label} color wheel`} style={{ width: SIZE, height: SIZE, alignSelf: 'center', marginBottom: 20 }}><Svg pointerEvents="none" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}><Defs><RadialGradient id="saturation" cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor="white" stopOpacity={1} /><Stop offset="1" stopColor="white" stopOpacity={0} /></RadialGradient></Defs>{sectors}<Circle cx={R} cy={R} r={R} fill="url(#saturation)" /><Circle cx={R} cy={R} r={R} fill="black" opacity={1 - hsv.v} /><Circle cx={marker[0]} cy={marker[1]} r={7} stroke="white" strokeWidth={2} fill="transparent" /></Svg></View>
    <View style={[ui.row, { justifyContent: 'space-between' }]}><Text style={{ color: colors.muted, fontSize: 12 }}>Brightness</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{Math.round(hsv.v * 100)}%</Text></View><Slider accessibilityLabel="Color brightness" minimumValue={0} maximumValue={1} value={hsv.v} onValueChange={v => set({ ...latest.current.hsv, v })} minimumTrackTintColor={colors.font} maximumTrackTintColor={colors.border} thumbTintColor={colors.font} style={{ height: 40 }} />
    <View style={[ui.row, { justifyContent: 'space-between' }]}><Text style={{ color: colors.muted, fontSize: 12 }}>Hex color</Text><TextInput accessibilityLabel="Hex color" autoCapitalize="characters" autoCorrect={false} maxLength={7} value={hex} onChangeText={setHex} onBlur={commitHex} onSubmitEditing={commitHex} style={[ui.input, { minWidth: 115, fontSize: 14, color: colors.font, backgroundColor: colors.primary, borderColor: colors.border }]} /></View>
  </View>;
}
