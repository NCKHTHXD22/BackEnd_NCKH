import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, Dimensions, Easing } from "react-native";
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
      {/* ── SVG Logo ── */}
      <Animated.View style={{ opacity: svgFade }}>
        <Svg width={SIZE} height={SIZE} viewBox="0 0 500 500">
          <Defs>
            <LinearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%"   stopColor="#4dc3ff"/>
              <Stop offset="40%"  stopColor="#1a7ddd"/>
              <Stop offset="100%" stopColor="#0a3a80"/>
            </LinearGradient>
            <LinearGradient id="shieldGrad" x1="0%" y1="0%" x2="30%" y2="100%">
              <Stop offset="0%"   stopColor="#1a5db8"/>
              <Stop offset="50%"  stopColor="#0d3d8c"/>
              <Stop offset="100%" stopColor="#071e4a"/>
            </LinearGradient>
            <LinearGradient id="shieldHL" x1="0%" y1="0%" x2="80%" y2="100%">
              <Stop offset="0%"   stopColor="#4dc3ff" stopOpacity="0.55"/>
              <Stop offset="100%" stopColor="#1a7ddd" stopOpacity="0"/>
            </LinearGradient>
            <LinearGradient id="textGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%"   stopColor="#7ddeff"/>
              <Stop offset="40%"  stopColor="#2aa8ff"/>
              <Stop offset="100%" stopColor="#0060c0"/>
            </LinearGradient>
            <RadialGradient id="nodeGrad" cx="50%" cy="50%" r="50%">
              <Stop offset="0%"   stopColor="#7de8ff"/>
              <Stop offset="100%" stopColor="#1a7ddd"/>
            </RadialGradient>
            <RadialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%"   stopColor="#0a3a80" stopOpacity="0.2"/>
              <Stop offset="100%" stopColor="#0a3a80" stopOpacity="0"/>
            </RadialGradient>
            <ClipPath id="shieldClip">
              <Path d="M250,95 L330,130 L345,180 L345,275 Q310,320 250,345 Q190,320 155,275 L155,180 L170,130 Z"/>
            </ClipPath>
          </Defs>

          {/* Background glow */}
          <Circle cx="250" cy="250" r="200" fill="url(#bgGlow)"/>

          {/* Outer dashed orbit ring */}
          <Circle cx="250" cy="250" r="195" fill="none" stroke="#1a7ddd" strokeWidth="1" strokeDasharray="6 8" opacity="0.3"/>

          {/* Main outer ring */}
          <Circle cx="250" cy="250" r="186" fill="none" stroke="url(#ringGrad)" strokeWidth="10" opacity="0.9"/>
          <Circle cx="250" cy="250" r="186" fill="none" stroke="#4dc3ff" strokeWidth="2" strokeDasharray="40 20 10 20 60 30" opacity="0.4"/>

          {/* Cardinal connector bars */}
          <G fill="none" stroke="url(#ringGrad)" strokeWidth="7" strokeLinecap="round">
            <Line x1="240" y1="64"  x2="260" y2="64"/>
            <Line x1="240" y1="436" x2="260" y2="436"/>
            <Line x1="64"  y1="240" x2="64"  y2="260"/>
            <Line x1="436" y1="240" x2="436" y2="260"/>
          </G>

          {/* Connection lines between nodes */}
          <G opacity="0.35" fill="none" stroke="#2aa8ff" strokeWidth="1.2" strokeDasharray="5 5">
            <Line x1="250" y1="76"  x2="413" y2="169"/>
            <Line x1="413" y1="169" x2="413" y2="331"/>
            <Line x1="413" y1="331" x2="250" y2="424"/>
            <Line x1="250" y1="424" x2="87"  y2="331"/>
            <Line x1="87"  y1="331" x2="87"  y2="169"/>
            <Line x1="87"  y1="169" x2="250" y2="76"/>
          </G>

          {/* Inner ring */}
          <Circle cx="250" cy="250" r="150" fill="none" stroke="url(#ringGrad)" strokeWidth="6" opacity="0.7"/>

          {/* Inner circuit nodes */}
          <G>
            {[
              [250,100],[390,180],[390,320],[250,400],[110,320],[110,180],
            ].map(([cx,cy], i) => (
              <Circle key={i} cx={cx} cy={cy} r="6" fill="#4dc3ff" stroke="#a8e8ff" strokeWidth="1.5"/>
            ))}
          </G>

          {/* People nodes (animated via RN Animated wrapper below) */}
          {NODES.map(({ cx, cy, i }) => (
            <G key={`node-${i}`}>
              <Circle cx={cx} cy={cy} r="10" fill="url(#nodeGrad)" stroke="#7de8ff" strokeWidth="1.5"/>
            </G>
          ))}

          {/* Outer spinning circuit arcs */}
          <Circle cx="250" cy="250" r="218" fill="none" stroke="#1a7ddd" strokeWidth="2"
                  strokeDasharray="30 15 8 15 50 20 8 20" opacity="0.25"/>
          <Circle cx="250" cy="250" r="228" fill="none" stroke="#4dc3ff" strokeWidth="1"
                  strokeDasharray="12 40 6 40" opacity="0.13"/>

          {/* Ring data particles (static position — RN Animated handles opacity) */}
          <Circle cx="250" cy="64"  r="3" fill="#7de8ff" opacity="0.8"/>
          <Circle cx="436" cy="250" r="2.5" fill="#4dc3ff" opacity="0.8"/>
          <Circle cx="64"  cy="250" r="2"   fill="#a8e8ff" opacity="0.8"/>

          {/* === SHIELD (float via RN wrapper below) === */}
          <Path d="M250,95 L330,130 L345,180 L345,275 Q310,320 250,345 Q190,320 155,275 L155,180 L170,130 Z"
                fill="url(#shieldGrad)" stroke="url(#ringGrad)" strokeWidth="3"/>
          <Path d="M250,95 L330,130 L345,180 L345,230 Q300,200 250,200 Q200,200 155,230 L155,180 L170,130 Z"
                fill="url(#shieldHL)" opacity="0.5"/>
          <Path d="M250,105 L323,137 L337,183 L337,271 Q305,312 250,334 Q195,312 163,271 L163,183 L177,137 Z"
                fill="none" stroke="#4dc3ff" strokeWidth="1" opacity="0.4"/>

          {/* City skyline */}
          <G clipPath="url(#shieldClip)" opacity="0.22">
            <Rect x="163" y="240" width="12" height="35" fill="#7de8ff"/>
            <Rect x="162" y="225" width="4"  height="18" fill="#7de8ff"/>
            <Rect x="178" y="250" width="20" height="25" fill="#7de8ff"/>
            <Rect x="200" y="230" width="22" height="45" fill="#7de8ff"/>
            <Rect x="224" y="245" width="14" height="30" fill="#7de8ff"/>
            <Rect x="240" y="220" width="18" height="55" fill="#7de8ff"/>
            <Rect x="247" y="205" width="4"  height="17" fill="#7de8ff"/>
            <Rect x="260" y="238" width="16" height="37" fill="#7de8ff"/>
            <Rect x="278" y="248" width="22" height="27" fill="#7de8ff"/>
            <Rect x="302" y="240" width="14" height="35" fill="#7de8ff"/>
            <Rect x="317" y="252" width="20" height="23" fill="#7de8ff"/>
            <Rect x="155" y="275" width="190" height="6" fill="#7de8ff"/>
          </G>

          {/* Tech mesh network */}
          <G opacity="0.55">
            {[[250,145],[215,165],[285,165],[200,195],[250,185],[300,195],[225,210],[275,210],[250,225]].map(([cx,cy],i) => (
              <Circle key={`mesh-${i}`} cx={cx} cy={cy} r={i===0?4:3} fill={i%2===0?"#4dc3ff":"#2aa8ff"}/>
            ))}
            <G fill="none" stroke="#4dc3ff" strokeWidth="0.9" opacity="0.7">
              <Line x1="250" y1="145" x2="215" y2="165"/><Line x1="250" y1="145" x2="285" y2="165"/>
              <Line x1="215" y1="165" x2="200" y2="195"/><Line x1="215" y1="165" x2="250" y2="185"/>
              <Line x1="285" y1="165" x2="250" y2="185"/><Line x1="285" y1="165" x2="300" y2="195"/>
              <Line x1="200" y1="195" x2="225" y2="210"/><Line x1="250" y1="185" x2="225" y2="210"/>
              <Line x1="250" y1="185" x2="275" y2="210"/><Line x1="300" y1="195" x2="275" y2="210"/>
              <Line x1="225" y1="210" x2="250" y2="225"/><Line x1="275" y1="210" x2="250" y2="225"/>
            </G>
          </G>

          {/* Lightning bolt */}
          <Path d="M254,132 L244,155 L252,155 L246,175 L262,150 L253,150 Z"
                fill="#a8e8ff" stroke="#7de8ff" strokeWidth="0.8" opacity="0.85"/>

          {/* Wave ornament */}
          <G fill="none" stroke="#4dc3ff" strokeWidth="2.5" strokeLinecap="round" opacity="0.5">
            <Path d="M215,285 Q228,270 250,278 Q272,286 285,270"/>
            <Path d="M225,298 Q238,283 250,291 Q262,299 275,283" strokeWidth="1.8" opacity="0.6"/>
          </G>

          {/* Scrollwork */}
          <Path d="M235,308 Q228,318 235,325 Q242,332 250,328 Q258,324 265,330 Q272,336 265,320 Q260,312 250,315 Q240,318 235,308 Z"
                fill="none" stroke="#2aa8ff" strokeWidth="2" strokeLinecap="round" opacity="0.45"/>

          {/* C-Life text */}
          <SvgText x="250" y="262" textAnchor="middle" fontFamily="serif"
                   fontWeight="900" fontSize="48"
                   fill="url(#textGrad)" stroke="#a8e8ff" strokeWidth="1">
            C-Life
          </SvgText>
          <Line x1="178" y1="273" x2="322" y2="273" stroke="#4dc3ff" strokeWidth="1" opacity="0.35" strokeLinecap="round"/>
        </Svg>
      </Animated.View>

      {/* ── Floating shield overlay (RN Animated translateY) ── */}
      <Animated.View
        style={[styles.floatOverlay, { transform: [{ translateY: floatY }] }]}
        pointerEvents="none"
      />

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
