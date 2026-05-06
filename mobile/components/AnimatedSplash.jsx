import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, Dimensions, Easing, Image } from "react-native";
import Svg, {
  Defs, LinearGradient, RadialGradient, Stop, Filter,
  FeGaussianBlur, FeMerge, FeMergeNode, ClipPath,
  Circle, Path, Line, Rect, Text as SvgText, G,
} from "react-native-svg";

const { width, height } = Dimensions.get("window");
const SIZE = Math.min(width * 0.78, 320);
const SCALE = SIZE / 500;

// Animated SVG wrappers
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG      = Animated.createAnimatedComponent(G);
const AnimatedPath   = Animated.createAnimatedComponent(Path);

export default function AnimatedSplash({ onFinish }) {
  // ── Animation values ────────────────────────────────────────────────────────
  const screenFade   = useRef(new Animated.Value(0)).current;  // overall fade-in
  const svgFade      = useRef(new Animated.Value(0)).current;
  const floatY       = useRef(new Animated.Value(0)).current;  // shield float
  const pulseOpacity = useRef(new Animated.Value(0.75)).current; // text glow
  const subtitleY    = useRef(new Animated.Value(20)).current;
  const subtitleFade = useRef(new Animated.Value(0)).current;

  // Node pulse values (6 nodes)
  const nodePulses = useRef(
    Array.from({ length: 6 }, () => new Animated.Value(1))
  ).current;

  // Ring particle positions (0→1 around ring circumference — we fake with opacity cycling)
  const particle1 = useRef(new Animated.Value(0)).current;
  const particle2 = useRef(new Animated.Value(0)).current;
  const particle3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // ── Screen & SVG fade in ─────────────────────────────────────────────────
    Animated.parallel([
      Animated.timing(screenFade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(svgFade,    { toValue: 1, duration: 800, delay: 100, useNativeDriver: true }),
    ]).start();

    // ── Shield floating loop ─────────────────────────────────────────────────
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -8, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatY, { toValue:  0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    // ── Text pulse loop ──────────────────────────────────────────────────────
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, { toValue: 1,    duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0.75, duration: 1500, useNativeDriver: true }),
      ])
    ).start();

    // ── Node pulse loops (staggered) ─────────────────────────────────────────
    nodePulses.forEach((val, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1.4, duration: 1400 + i * 200, delay: i * 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(val, { toValue: 1.0, duration: 1400 + i * 200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    });

    // ── Particles cycling opacity on ring ────────────────────────────────────
    const particleLoop = (val, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1,   duration: 2000, delay, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0,   duration: 2000,        useNativeDriver: true }),
          Animated.timing(val, { toValue: 0,   duration: 2000,        useNativeDriver: true }),
        ])
      ).start();
    particleLoop(particle1, 0);
    particleLoop(particle2, 2000);
    particleLoop(particle3, 4000);

    // ── Subtitle appears after 800ms ─────────────────────────────────────────
    Animated.parallel([
      Animated.timing(subtitleFade, { toValue: 1, duration: 700, delay: 800, useNativeDriver: true }),
      Animated.timing(subtitleY,    { toValue: 0, duration: 700, delay: 800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    // ── Auto-dismiss after 2.8s ──────────────────────────────────────────────
    const timer = setTimeout(() => {
      Animated.timing(screenFade, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        onFinish?.();
      });
    }, 2800);

    return () => clearTimeout(timer);
  }, []);

  // Node positions on the outer ring (r=186, centered 250,250)
  const NODES = [
    { cx: 250, cy:  66, i: 0 },  // top (12)
    { cx: 413, cy: 161, i: 1 },  // top-right (2)
    { cx: 413, cy: 339, i: 2 },  // bottom-right (4)
    { cx: 250, cy: 434, i: 3 },  // bottom (6)
    { cx:  87, cy: 339, i: 4 },  // bottom-left (8)
    { cx:  87, cy: 161, i: 5 },  // top-left (10)
  ];

  return (
    <Animated.View style={[styles.container, { opacity: screenFade }]}>
      {/* ── SVG Glow and Logo Image ── */}
      <Animated.View style={{ opacity: svgFade, alignItems: 'center', justifyContent: 'center', width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE} viewBox="0 0 500 500" style={{ position: 'absolute' }}>
          <Defs>
            <RadialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%"   stopColor="#7de8ff" stopOpacity="0.8"/>
              <Stop offset="60%"  stopColor="#0a3a80" stopOpacity="0.2"/>
              <Stop offset="100%" stopColor="#03122a" stopOpacity="0"/>
            </RadialGradient>
          </Defs>
          <Circle cx="250" cy="250" r="220" fill="url(#bgGlow)"/>
        </Svg>
        <Animated.Image 
          source={require('../assets/images/Logo_V1_transparent.png')} 
          style={{ width: SIZE * 0.7, height: SIZE * 0.7, zIndex: 10, transform: [{ translateY: floatY }] }}
          resizeMode="contain"
        />
      </Animated.View>

      {/* ── Subtitle text ── */}
      <Animated.Text
        style={[
          styles.subtitle,
          { opacity: subtitleFade, transform: [{ translateY: subtitleY }] },
        ]}
      >
        Hệ thống cảnh báo ngập lụt
      </Animated.Text>

      <Animated.Text
        style={[
          styles.subline,
          { opacity: subtitleFade },
        ]}
      >
        Community Flood Warning System
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#03122a",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  floatOverlay: {
    position: "absolute",
    width: 1,
    height: 1,
  },
  subtitle: {
    marginTop: 24,
    color: "#7de8ff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
    textAlign: "center",
  },
  subline: {
    marginTop: 6,
    color: "#2aa8ff",
    fontSize: 11,
    letterSpacing: 2,
    textAlign: "center",
    opacity: 0.7,
  },
});
