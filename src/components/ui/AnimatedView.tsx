import Animated from 'react-native-reanimated';
import { cssInterop } from 'nativewind';

/** Animated.View de Reanimated qui accepte `className` (NativeWind). Animations d'entrée via `entering`. */
export const AnimatedView = cssInterop(Animated.View, { className: 'style' });

export { FadeIn, FadeInDown, FadeInUp, SlideInDown, ZoomIn } from 'react-native-reanimated';
