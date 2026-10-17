import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

// Animazioni leggere fatte con l'Animated di React Native (funziona uguale su telefono e sito).
// Se nel telefono è attivo "Riduci movimento", le animazioni si spengono.

const useNativeDriver = Platform.OS !== 'web';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => alive && setReduced(value))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  /** Quanto si rimpicciolisce al tocco (0.96 = 4%). */
  scaleTo?: number;
};

/** Pressable che "rimbalza" leggermente quando lo tocchi. */
export function PressableScale({ style, scaleTo = 0.96, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);

  const animate = (to: number) => {
    if (reduced) return;
    Animated.spring(scale, { toValue: to, useNativeDriver, speed: 40, bounciness: to === 1 ? 10 : 0 }).start();
  };
  const resolved = typeof style === 'function' ? style({ pressed }) : style;

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        animate(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        animate(1);
        onPressOut?.(e);
      }}
      style={[resolved, { transform: [{ scale }] }]}
    />
  );
}

/** Fa entrare il contenuto con dolcezza (dissolvenza + piccolo scivolamento verso l'alto). */
export function FadeIn({ children, index = 0, style }: { children: ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 280,
      delay: Math.min(index, 8) * 45,
      easing: Easing.out(Easing.cubic),
      useNativeDriver,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, index]);
  if (reduced) return <Animated.View style={style}>{children}</Animated.View>;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** Un piccolo "pop" ogni volta che `value` cambia (es. cuore di "Voglio andarci"). */
export function PopOnChange({ value, children }: { value: unknown; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    scale.setValue(0.9);
    Animated.spring(scale, { toValue: 1, useNativeDriver, speed: 14, bounciness: 14 }).start();
  }, [value, reduced, scale]);
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}
