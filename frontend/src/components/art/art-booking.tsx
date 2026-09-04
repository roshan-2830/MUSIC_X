/** "Book it all in one place" — supplied illustration, first of the three in the file.
 *
 * Cropped to its own bounding box (measured in the browser: x=31 y=13 w=320 h=271, since
 * it occupied one corner of a 1000x300 canvas), background removed, and recoloured.
 *
 * RECOLOURED BY HUE, NOT BY LIST. This artwork is built from 340 gradients. A hand-written
 * list of hex values caught about a dozen and left the rest blue, so the remap works on
 * hue families instead: blues to violet, golds to accent, magenta to green. Skin is
 * deliberately excluded — it shares a hue neighbourhood with the pink car, and sweeping
 * both together turned the woman's face green.
 *
 * GRADIENT INHERITANCE INLINED. The original had 264 gradients carrying no stops of their
 * own, pointing at 38 bases via xlink:href. Browsers resolve that; react-native-svg's
 * support for it is unreliable and there is no way to test the native renderer without a
 * full build, so the stops are copied in and no xlink:href remains.
 *
 * Note this one is a soft-gradient illustration while slides 1 and 3 are flat and bold.
 * It is in the right palette now, but it is not in the same drawing style.
 */
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

export default function ArtBooking({ width = 320, height = 320 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="26 8 330 281">
      <Defs>
      <LinearGradient id="linear-gradient" x1="-29.983" y1="839.373" x2="-37.051" y2="812.28" gradientTransform="translate(1483.701 -370.52) rotate(39.294)" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#864fe6"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-2" x1="-145.133" y1="735.733" x2="-134.727" y2="717.5" gradientTransform="translate(1387.744 -329.566) rotate(26.327)" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#7140c6"/>
      <Stop offset=".994" stopColor="#a47beb"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-3" x1="1034.521" y1="250.11" x2="761.437" y2="265.299" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-4" x1="732.992" y1="281.704" x2="716.36" y2="117.423" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset="1" stopColor="#a77bf2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-5" x1="810.866" y1="273.821" x2="794.234" y2="109.539">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset="1" stopColor="#a77bf2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-6" x1="820.556" y1="251.508" x2="784.059" y2="22.209" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-7" x1="808.552" y1="81.892" x2="808.552" y2="265.132" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".21" stopColor="#f6f1fe"/>
      <Stop offset=".61" stopColor="#ddcdfa"/>
      <Stop offset=".994" stopColor="#c4a7f6"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-8" x1="741.647" y1="100.811" x2="860.087" y2="100.811" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".018" stopColor="#faf8fd"/>
      <Stop offset=".148" stopColor="#dbccf6"/>
      <Stop offset=".282" stopColor="#c1a5f0"/>
      <Stop offset=".417" stopColor="#ab86eb"/>
      <Stop offset=".555" stopColor="#9a6de7"/>
      <Stop offset=".694" stopColor="#8e5ce4"/>
      <Stop offset=".839" stopColor="#8752e2"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-9" x1="724.462" y1="99.93" x2="765.2" y2="101.687">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-10" x1="764.777" y1="67.639" x2="764.777" y2="14.387" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#e5d8fb"/>
      <Stop offset=".137" stopColor="#dacaf7"/>
      <Stop offset=".4" stopColor="#c0a5ef"/>
      <Stop offset=".76" stopColor="#976be2"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <ClipPath id="clippath">
      <Rect x="730.403" y="25.829" width="68.749" height="38.808" rx="3.556" ry="3.556" fill="url(#linear-gradient-10)"/>
      </ClipPath>
      <LinearGradient id="linear-gradient-11" x1="787.26" y1="88.115" x2="787.26" y2="29.217" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".283" stopColor="#ecfe76"/>
      <Stop offset=".903" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <ClipPath id="clippath-1">
      <Rect x="752.489" y="47.09" width="69.542" height="38.4" rx="3.556" ry="3.556" fill="url(#linear-gradient-11)"/>
      </ClipPath>
      <LinearGradient id="linear-gradient-12" x1="788.011" y1="276.501" x2="788.011" y2="67.714" gradientTransform="translate(-57.752) skewX(12.484)" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".268" stopColor="#d8c8f5"/>
      <Stop offset=".616" stopColor="#ac87eb"/>
      <Stop offset=".868" stopColor="#905fe4"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-13" x1="788.007" y1="270.882" x2="788.007" y2="62.096" gradientTransform="translate(-57.752) skewX(12.484)" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".181" stopColor="#ddcef7"/>
      <Stop offset=".378" stopColor="#bea2ef"/>
      <Stop offset=".564" stopColor="#a57ee9"/>
      <Stop offset=".735" stopColor="#9364e5"/>
      <Stop offset=".884" stopColor="#8955e2"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-14" x1="788.009" y1="265.677" x2="788.009" y2="56.89">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".268" stopColor="#d8c8f5"/>
      <Stop offset=".616" stopColor="#ac87eb"/>
      <Stop offset=".868" stopColor="#905fe4"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-15" x1="780.236" y1="161.101" x2="780.236" y2="143.402" gradientTransform="translate(-57.752) skewX(12.484)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset="1" stopColor="#a77bf2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-16" x1="775.964" y1="156.898" x2="775.964" y2="150.734" gradientTransform="translate(-57.752) skewX(12.484)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset="1" stopColor="#a77bf2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-17" x1="783.354" y1="139.338" x2="783.354" y2="154.392" gradientTransform="translate(-57.752) skewX(12.484)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset="1" stopColor="#a77bf2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-18" x1="777.672" y1="124.453" x2="777.672" y2="168.639" gradientTransform="translate(-57.752) skewX(12.484)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset="1" stopColor="#a77bf2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-19" x1="799.717" y1="148.965" x2="799.717" y2="156.939" gradientTransform="translate(-57.752) skewX(12.484)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset="1" stopColor="#a77bf2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-20" x1="796.299" y1="161.101" x2="796.299" y2="143.402" gradientTransform="translate(-57.752) skewX(12.484)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset="1" stopColor="#a77bf2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-21" x1="789.89" y1="124.453" x2="789.89" y2="168.639" gradientTransform="translate(-57.752) skewX(12.484)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset="1" stopColor="#a77bf2"/>
      </LinearGradient>
      <ClipPath id="clippath-2">
      <Path d="M762.198,209.814h29.02c1.487,0,2.426-1.206,2.096-2.693l-6.426-29.02c-.329-1.487-1.802-2.693-3.289-2.693h-29.02c-1.487,0-2.426,1.206-2.096,2.693l6.426,29.02c.329,1.487,1.802,2.693,3.289,2.693Z" fill="none"/>
      </ClipPath>
      <LinearGradient id="linear-gradient-22" x1="787.727" y1="178.66" x2="787.727" y2="192.459" gradientTransform="translate(-57.752) skewX(12.484)" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-23" x1="802.238" y1="185.529" x2="802.238" y2="199.693">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-24" x1="785.929" y1="186.376" x2="785.929" y2="212.771" gradientTransform="translate(-57.752) skewX(12.484)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".018" stopColor="#faf8fd"/>
      <Stop offset=".148" stopColor="#dbccf6"/>
      <Stop offset=".282" stopColor="#c1a5f0"/>
      <Stop offset=".417" stopColor="#ab86eb"/>
      <Stop offset=".555" stopColor="#9a6de7"/>
      <Stop offset=".694" stopColor="#8e5ce4"/>
      <Stop offset=".839" stopColor="#8752e2"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-25" x1="788.821" y1="257.428" x2="788.821" y2="245.255" gradientTransform="translate(-57.752) skewX(12.484)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-26" x1="791.926" y1="240.701" x2="791.926" y2="267.567" gradientTransform="translate(-57.752) skewX(12.484)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".018" stopColor="#faf8fd"/>
      <Stop offset=".148" stopColor="#dbccf6"/>
      <Stop offset=".282" stopColor="#c1a5f0"/>
      <Stop offset=".417" stopColor="#ab86eb"/>
      <Stop offset=".555" stopColor="#9a6de7"/>
      <Stop offset=".694" stopColor="#8e5ce4"/>
      <Stop offset=".839" stopColor="#8752e2"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-27" x1="780.033" y1="240.701" x2="780.033" y2="267.567" gradientTransform="translate(-57.752) skewX(12.484)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".018" stopColor="#faf8fd"/>
      <Stop offset=".148" stopColor="#dbccf6"/>
      <Stop offset=".282" stopColor="#c1a5f0"/>
      <Stop offset=".417" stopColor="#ab86eb"/>
      <Stop offset=".555" stopColor="#9a6de7"/>
      <Stop offset=".694" stopColor="#8e5ce4"/>
      <Stop offset=".839" stopColor="#8752e2"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-28" x1="788.009" y1="240.702" x2="788.009" y2="267.567" gradientTransform="translate(-57.752) skewX(12.484)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".018" stopColor="#faf8fd"/>
      <Stop offset=".148" stopColor="#dbccf6"/>
      <Stop offset=".282" stopColor="#c1a5f0"/>
      <Stop offset=".417" stopColor="#ab86eb"/>
      <Stop offset=".555" stopColor="#9a6de7"/>
      <Stop offset=".694" stopColor="#8e5ce4"/>
      <Stop offset=".839" stopColor="#8752e2"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-29" x1="780.034" y1="240.701" x2="780.034" y2="267.567" gradientTransform="translate(-57.752) skewX(12.484)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".018" stopColor="#faf8fd"/>
      <Stop offset=".148" stopColor="#dbccf6"/>
      <Stop offset=".282" stopColor="#c1a5f0"/>
      <Stop offset=".417" stopColor="#ab86eb"/>
      <Stop offset=".555" stopColor="#9a6de7"/>
      <Stop offset=".694" stopColor="#8e5ce4"/>
      <Stop offset=".839" stopColor="#8752e2"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-30" x1="789.623" y1="117.476" x2="798.545" y2="127.193" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-31" x1="790.811" y1="116.385" x2="799.734" y2="126.102">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-32" x1="794.073" y1="113.39" x2="802.996" y2="123.107">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-33" x1="788.415" y1="118.586" x2="797.337" y2="128.303">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-34" x1="787.158" y1="119.74" x2="796.08" y2="129.457" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".497" stopColor="#f1afa2"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-35" x1="789.649" y1="117.453" x2="798.571" y2="127.17">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-36" x1="809.787" y1="195.895" x2="821.592" y2="125.068" gradientUnits="userSpaceOnUse">
      <Stop offset=".047" stopColor="#164a32"/>
      <Stop offset=".863" stopColor="#56b98b"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-37" x1="812.066" y1="161.449" x2="824.451" y2="163.634">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-38" x1="811.807" y1="162.917" x2="824.192" y2="165.102">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-39" x1="811.592" y1="164.133" x2="823.977" y2="166.318">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-40" x1="811.402" y1="165.211" x2="823.787" y2="167.396">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-41" x1="812.76" y1="123.446" x2="809.365" y2="162.33" gradientTransform="translate(27.436 425.632) rotate(-29.482) scale(.977) skewX(10.345)">
      <Stop offset="0" stopColor="#e5d8fb"/>
      <Stop offset=".137" stopColor="#dacaf7"/>
      <Stop offset=".4" stopColor="#c0a5ef"/>
      <Stop offset=".76" stopColor="#976be2"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-42" x1="810.111" y1="144.987" x2="810.111" y2="171.066" gradientTransform="translate(27.436 425.632) rotate(-29.482) scale(.977) skewX(10.345)" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#261c38"/>
      <Stop offset=".146" stopColor="#2a1f3e"/>
      <Stop offset=".369" stopColor="#372852"/>
      <Stop offset=".641" stopColor="#4d3773"/>
      <Stop offset=".949" stopColor="#6b4ba1"/>
      <Stop offset="1" stopColor="#7150a9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-43" x1="812.043" y1="161.575" x2="824.429" y2="163.761">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-44" x1="811.65" y1="163.807" x2="824.035" y2="165.993">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-45" x1="859.642" y1="287.052" x2="833.138" y2="182.577" gradientTransform="translate(-18.234) skewX(5.574)" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#412a69"/>
      <Stop offset=".164" stopColor="#442b6f"/>
      <Stop offset=".413" stopColor="#4e2f83"/>
      <Stop offset=".716" stopColor="#5d35a3"/>
      <Stop offset="1" stopColor="#703dc7"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-46" x1="843.504" y1="291.15" x2="817" y2="186.675">
      <Stop offset="0" stopColor="#412a69"/>
      <Stop offset=".164" stopColor="#442b6f"/>
      <Stop offset=".413" stopColor="#4e2f83"/>
      <Stop offset=".716" stopColor="#5d35a3"/>
      <Stop offset="1" stopColor="#703dc7"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-47" x1="893.805" y1="283.743" x2="866.058" y2="174.371" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#412a69"/>
      <Stop offset=".164" stopColor="#442b6f"/>
      <Stop offset=".413" stopColor="#4e2f83"/>
      <Stop offset=".716" stopColor="#5d35a3"/>
      <Stop offset="1" stopColor="#703dc7"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-48" x1="851.446" y1="148.842" x2="850.695" y2="114.589" gradientUnits="userSpaceOnUse">
      <Stop offset=".058" stopColor="#c5d84e"/>
      <Stop offset=".891" stopColor="#a85b24"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-49" x1="839.588" y1="149.102" x2="838.837" y2="114.849">
      <Stop offset=".058" stopColor="#c5d84e"/>
      <Stop offset=".891" stopColor="#a85b24"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-50" x1="843.754" y1="149.01" x2="843.003" y2="114.758">
      <Stop offset=".058" stopColor="#c5d84e"/>
      <Stop offset=".891" stopColor="#a85b24"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-51" x1="837.088" y1="197.699" x2="848.266" y2="130.631">
      <Stop offset=".047" stopColor="#164a32"/>
      <Stop offset=".863" stopColor="#56b98b"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-52" x1="841.313" y1="145.833" x2="842.054" y2="135.556" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".142" stopColor="#f5f1fb"/>
      <Stop offset=".415" stopColor="#daccf2"/>
      <Stop offset=".788" stopColor="#b092e4"/>
      <Stop offset=".994" stopColor="#9870dc"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-53" x1="843.543" y1="122.76" x2="842.276" y2="137.263">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-54" x1="843.175" y1="122.728" x2="841.908" y2="137.231">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-55" x1="838.07" y1="122.282" x2="836.804" y2="136.785">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-56" x1="841.913" y1="149.052" x2="841.162" y2="114.798">
      <Stop offset=".058" stopColor="#c5d84e"/>
      <Stop offset=".891" stopColor="#a85b24"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-57" x1="846.837" y1="148.943" x2="846.087" y2="114.69">
      <Stop offset=".058" stopColor="#c5d84e"/>
      <Stop offset=".891" stopColor="#a85b24"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-58" x1="846.711" y1="123.037" x2="845.445" y2="137.54">
      <Stop offset="0" stopColor="#f2b5a7"/>
      <Stop offset=".697" stopColor="#f0ab9e"/>
      <Stop offset="1" stopColor="#f0a69a"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-59" x1="909.068" y1="279.516" x2="882.564" y2="175.04" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#412a69"/>
      <Stop offset=".164" stopColor="#442b6f"/>
      <Stop offset=".413" stopColor="#4e2f83"/>
      <Stop offset=".716" stopColor="#5d35a3"/>
      <Stop offset="1" stopColor="#703dc7"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-60" x1="840.088" y1="187.868" x2="850.165" y2="127.406" gradientTransform="translate(207.651 -418.555) rotate(31.797)">
      <Stop offset=".047" stopColor="#164a32"/>
      <Stop offset=".863" stopColor="#56b98b"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-61" x1="923.98" y1="182.85" x2="923.98" y2="65.163" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#e5d8fb"/>
      <Stop offset=".373" stopColor="#bb9eed"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-62" x1="936.559" y1="209.102" x2="936.559" y2="101.39">
      <Stop offset="0" stopColor="#e5d8fb"/>
      <Stop offset=".373" stopColor="#bb9eed"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-63" x1="936.559" y1="146.5" x2="936.559" y2="214.384" gradientTransform="translate(953.556 -781.43) rotate(80.715)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".21" stopColor="#f6f1fe"/>
      <Stop offset=".61" stopColor="#ddcdfa"/>
      <Stop offset=".994" stopColor="#c4a7f6"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-64" x1="936.559" y1="146.5" x2="936.559" y2="214.384" gradientTransform="translate(953.556 -781.43) rotate(80.715)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".21" stopColor="#f6f1fe"/>
      <Stop offset=".61" stopColor="#ddcdfa"/>
      <Stop offset=".994" stopColor="#c4a7f6"/>
      </LinearGradient>
      <ClipPath id="clippath-3">
      <Circle cx="936.559" cy="170.342" r="23.234" transform="translate(617.335 1067.145) rotate(-80.715)" fill="url(#linear-gradient-64)"/>
      </ClipPath>
      <LinearGradient id="linear-gradient-65" x1="951.072" y1="219.82" x2="951.072" y2="150.598" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-66" x1="918.113" y1="219.82" x2="918.113" y2="150.599" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-67" x1="942.938" y1="219.82" x2="942.938" y2="150.598" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-68" x1="860.379" y1="83.799" x2="961.279" y2="82.874" gradientUnits="userSpaceOnUse">
      <Stop offset=".117" stopColor="#fff"/>
      <Stop offset=".272" stopColor="#ebf8f2"/>
      <Stop offset=".589" stopColor="#bae8d3"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-69" x1="888.947" y1="70.522" x2="903.293" y2="88.179" gradientUnits="userSpaceOnUse">
      <Stop offset=".117" stopColor="#8ee3bb"/>
      <Stop offset=".441" stopColor="#79d5aa"/>
      <Stop offset=".98" stopColor="#51b988"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-70" x1="860.526" y1="96.482" x2="961.375" y2="95.556">
      <Stop offset=".117" stopColor="#fff"/>
      <Stop offset=".272" stopColor="#ebf8f2"/>
      <Stop offset=".589" stopColor="#bae8d3"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-71" x1="838.871" y1="44.765" x2="920.239" y2="43.828">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".21" stopColor="#f6f1fe"/>
      <Stop offset=".61" stopColor="#ddcdfa"/>
      <Stop offset=".994" stopColor="#c4a7f6"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-72" x1="839.054" y1="60.586" x2="920.421" y2="59.649">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".21" stopColor="#f6f1fe"/>
      <Stop offset=".61" stopColor="#ddcdfa"/>
      <Stop offset=".994" stopColor="#c4a7f6"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-73" x1="878.383" y1="11.434" x2="830.374" y2="60.982" gradientTransform="translate(-.894 34.852) rotate(-2.315)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-74" x1="881.857" y1="14.8" x2="833.848" y2="64.348" gradientTransform="translate(-.894 34.852) rotate(-2.315)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-75" x1="875.704" y1="8.839" x2="827.695" y2="58.386" gradientTransform="translate(-.894 34.852) rotate(-2.315)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-76" x1="888.117" y1="20.866" x2="840.108" y2="70.413" gradientTransform="translate(-.894 34.852) rotate(-2.315)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-77" x1="449.867" y1="339.598" x2="455.367" y2="328.079" gradientTransform="translate(1099.201 136.184) rotate(-156.847) scale(1 -1)" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset="1" stopColor="#a379eb"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-78" x1="467.578" y1="287.399" x2="474.795" y2="272.283" gradientTransform="translate(1064.255 472.188) rotate(-126.87) scale(1 -1)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset="1" stopColor="#a379eb"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-79" x1="524.962" y1="225.401" x2="524.962" y2="17.392" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#e5d8fb"/>
      <Stop offset=".176" stopColor="#dbcaf9"/>
      <Stop offset=".514" stopColor="#c3a6f4"/>
      <Stop offset=".977" stopColor="#9c6cee"/>
      <Stop offset=".989" stopColor="#9b6bee"/>
      </LinearGradient>
      <ClipPath id="clippath-4">
      <Rect x="404.692" y="49.708" width="240.539" height="193.132" fill="none"/>
      </ClipPath>
      <LinearGradient id="linear-gradient-80" x1="565.139" y1="-14.764" x2="565.139" y2="245.391" gradientTransform="translate(153.539 -261.605) rotate(29.988)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-81" x1="543.431" y1="-14.764" x2="543.431" y2="245.391" gradientTransform="translate(37.293 -89.532) rotate(9.751)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-82" x1="545.719" y1="-14.764" x2="545.719" y2="245.392" gradientTransform="translate(588.679 -460.166) rotate(84.935)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-83" x1="639.207" y1="-14.763" x2="639.207" y2="245.392" gradientTransform="translate(85.905 -216.722) rotate(20.601)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-84" x1="514.895" y1="-14.764" x2="514.895" y2="245.392" gradientTransform="translate(74.312 -122.291) rotate(14.587)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-85" x1="465.139" y1="-14.763" x2="465.139" y2="245.392" gradientTransform="translate(125.502 -169.161) rotate(23.741)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-86" x1="610.351" y1="-14.764" x2="610.351" y2="245.392" gradientTransform="translate(515.873 -543.131) rotate(75.235)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-87" x1="465.139" y1="-14.764" x2="465.139" y2="245.391" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#6a3abd"/>
      <Stop offset=".146" stopColor="#7346c1"/>
      <Stop offset=".412" stopColor="#8c64d0"/>
      <Stop offset=".765" stopColor="#b496e7"/>
      <Stop offset=".994" stopColor="#d1baf8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-88" x1="333.6" y1="257.64" x2="623.685" y2="282.792">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".142" stopColor="#f5f1fb"/>
      <Stop offset=".415" stopColor="#daccf2"/>
      <Stop offset=".788" stopColor="#b092e4"/>
      <Stop offset=".994" stopColor="#9870dc"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-89" x1="515.671" y1="275.451" x2="540.728" y2="274.993" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#261c38"/>
      <Stop offset=".146" stopColor="#2a1f3e"/>
      <Stop offset=".369" stopColor="#372852"/>
      <Stop offset=".641" stopColor="#4d3773"/>
      <Stop offset=".949" stopColor="#6b4ba1"/>
      <Stop offset="1" stopColor="#7150a9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-90" x1="504.236" y1="184.291" x2="504.236" y2="282.461">
      <Stop offset=".047" stopColor="#164a32"/>
      <Stop offset=".863" stopColor="#56b98b"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-91" x1="492.314" y1="275.843" x2="474.73" y2="274.949" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#261c38"/>
      <Stop offset=".146" stopColor="#2a1f3e"/>
      <Stop offset=".369" stopColor="#372852"/>
      <Stop offset=".641" stopColor="#4d3773"/>
      <Stop offset=".949" stopColor="#6b4ba1"/>
      <Stop offset="1" stopColor="#7150a9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-92" x1="481.366" y1="184.291" x2="481.366" y2="282.461">
      <Stop offset=".047" stopColor="#164a32"/>
      <Stop offset=".863" stopColor="#56b98b"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-93" x1="460.623" y1="132.863" x2="451.254" y2="158.025" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#ed9b89"/>
      <Stop offset=".262" stopColor="#e39381"/>
      <Stop offset=".693" stopColor="#ca7f6d"/>
      <Stop offset="1" stopColor="#b56e5c"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-94" x1="537.006" y1="128.602" x2="548.035" y2="145.075">
      <Stop offset="0" stopColor="#ed9b89"/>
      <Stop offset=".262" stopColor="#e39381"/>
      <Stop offset=".693" stopColor="#ca7f6d"/>
      <Stop offset="1" stopColor="#b56e5c"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-95" x1="-220.997" y1="185.844" x2="-206.98" y2="116.555" gradientTransform="translate(297.519) rotate(-180) scale(1 -1)" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#fafafa"/>
      <Stop offset=".196" stopColor="#eee8f8"/>
      <Stop offset=".465" stopColor="#e2d6f7"/>
      <Stop offset=".734" stopColor="#dbcbf6"/>
      <Stop offset="1" stopColor="#d9c7f7"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-96" x1="485.013" y1="136.921" x2="485.732" y2="118.234">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-97" x1="-191.342" y1="102.949" x2="-183.535" y2="133.358" gradientTransform="translate(297.519) rotate(-180) scale(1 -1)">
      <Stop offset="0" stopColor="#ed9b89"/>
      <Stop offset=".262" stopColor="#e39381"/>
      <Stop offset=".693" stopColor="#ca7f6d"/>
      <Stop offset="1" stopColor="#b56e5c"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-98" x1="-192.304" y1="132.114" x2="-185.052" y2="160.364" gradientTransform="translate(286.595 -4.196) rotate(175.082) scale(1 -.933) skewX(.512)">
      <Stop offset="0" stopColor="#ed9b89"/>
      <Stop offset=".262" stopColor="#e39381"/>
      <Stop offset=".693" stopColor="#ca7f6d"/>
      <Stop offset="1" stopColor="#b56e5c"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-99" x1="483.191" y1="136.851" x2="483.91" y2="118.164">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-100" x1="489.869" y1="137.108" x2="490.587" y2="118.42">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-101" x1="-168.926" y1="31.446" x2="-162.125" y2="57.938" gradientTransform="translate(324.773 36.483) rotate(-167.96) scale(1 -1)">
      <Stop offset="0" stopColor="#ed9b89"/>
      <Stop offset=".262" stopColor="#e39381"/>
      <Stop offset=".693" stopColor="#ca7f6d"/>
      <Stop offset="1" stopColor="#b56e5c"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-102" x1="503.797" y1="182.936" x2="497.803" y2="124.246" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#decefa"/>
      <Stop offset=".341" stopColor="#e7dbfb"/>
      <Stop offset=".994" stopColor="#fff"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-103" x1="532.686" y1="126.631" x2="535.046" y2="224.259">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-104" x1="539.134" y1="127.177" x2="550.164" y2="143.65">
      <Stop offset="0" stopColor="#ed9b89"/>
      <Stop offset=".262" stopColor="#e39381"/>
      <Stop offset=".693" stopColor="#ca7f6d"/>
      <Stop offset="1" stopColor="#b56e5c"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-105" x1="536.644" y1="128.844" x2="547.674" y2="145.318">
      <Stop offset="0" stopColor="#ed9b89"/>
      <Stop offset=".262" stopColor="#e39381"/>
      <Stop offset=".693" stopColor="#ca7f6d"/>
      <Stop offset="1" stopColor="#b56e5c"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-106" x1="535.955" y1="129.305" x2="546.985" y2="145.779">
      <Stop offset="0" stopColor="#ed9b89"/>
      <Stop offset=".262" stopColor="#e39381"/>
      <Stop offset=".693" stopColor="#ca7f6d"/>
      <Stop offset="1" stopColor="#b56e5c"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-107" x1="535.189" y1="129.818" x2="546.219" y2="146.292">
      <Stop offset="0" stopColor="#ed9b89"/>
      <Stop offset=".262" stopColor="#e39381"/>
      <Stop offset=".693" stopColor="#ca7f6d"/>
      <Stop offset="1" stopColor="#b56e5c"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-108" x1="457.075" y1="131.112" x2="447.044" y2="158.054">
      <Stop offset="0" stopColor="#ed9b89"/>
      <Stop offset=".262" stopColor="#e39381"/>
      <Stop offset=".693" stopColor="#ca7f6d"/>
      <Stop offset="1" stopColor="#b56e5c"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-109" x1="459.14" y1="131.876" x2="449.264" y2="158.401">
      <Stop offset="0" stopColor="#ed9b89"/>
      <Stop offset=".262" stopColor="#e39381"/>
      <Stop offset=".693" stopColor="#ca7f6d"/>
      <Stop offset="1" stopColor="#b56e5c"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-110" x1="460.521" y1="132.242" x2="450.604" y2="158.876">
      <Stop offset="0" stopColor="#ed9b89"/>
      <Stop offset=".262" stopColor="#e39381"/>
      <Stop offset=".693" stopColor="#ca7f6d"/>
      <Stop offset="1" stopColor="#b56e5c"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-111" x1="461.655" y1="133.4" x2="452.298" y2="158.532">
      <Stop offset="0" stopColor="#ed9b89"/>
      <Stop offset=".262" stopColor="#e39381"/>
      <Stop offset=".693" stopColor="#ca7f6d"/>
      <Stop offset="1" stopColor="#b56e5c"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-112" x1="489.059" y1="127.685" x2="491.419" y2="225.313">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-113" x1="562.698" y1="45.236" x2="562.698" y2="88.371" gradientUnits="userSpaceOnUse">
      <Stop offset=".106" stopColor="#b03a37"/>
      <Stop offset=".413" stopColor="#c04e47"/>
      <Stop offset=".98" stopColor="#e87d6f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-114" x1="400.023" y1="55.167" x2="400.023" y2="188.087" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-115" x1="377.455" y1="169.065" x2="377.455" y2="139.143" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#decefa"/>
      <Stop offset=".341" stopColor="#e7dbfb"/>
      <Stop offset=".994" stopColor="#fff"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-116" x1="430.754" y1="140.777" x2="392.959" y2="140.237">
      <Stop offset="0" stopColor="#decefa"/>
      <Stop offset=".341" stopColor="#e7dbfb"/>
      <Stop offset=".994" stopColor="#fff"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-117" x1="430.678" y1="146.149" x2="392.882" y2="145.609">
      <Stop offset="0" stopColor="#decefa"/>
      <Stop offset=".341" stopColor="#e7dbfb"/>
      <Stop offset=".994" stopColor="#fff"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-118" x1="400.023" y1="189.233" x2="400.023" y2="106.594">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <ClipPath id="clippath-5">
      <Rect x="367.595" y="136.534" width="19.72" height="19.72" fill="none"/>
      </ClipPath>
      <LinearGradient id="linear-gradient-119" x1="380.764" y1="160.468" x2="380.764" y2="137.737" gradientUnits="userSpaceOnUse">
      <Stop offset=".117" stopColor="#a1f7cf"/>
      <Stop offset=".562" stopColor="#8ce6bc"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-120" x1="366.784" y1="155.908" x2="366.784" y2="141.215" gradientTransform="translate(388.959 -239.961) rotate(69.701)" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".105" stopColor="#f8fed8"/>
      <Stop offset=".308" stopColor="#f8fdd8"/>
      <Stop offset=".587" stopColor="#f1fcaa"/>
      <Stop offset=".929" stopColor="#e1f94a"/>
      <Stop offset="1" stopColor="#def834"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-121" x1="381.122" y1="160.468" x2="381.122" y2="137.737" gradientTransform="translate(97.428 -140.419) rotate(23.853)">
      <Stop offset=".117" stopColor="#a1f7cf"/>
      <Stop offset=".562" stopColor="#8ce6bc"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-122" y1="55.167" y2="188.087">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-123" y1="107.865" y2="77.944">
      <Stop offset="0" stopColor="#decefa"/>
      <Stop offset=".341" stopColor="#e7dbfb"/>
      <Stop offset=".994" stopColor="#fff"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-124" x1="420.071" y1="79.502" x2="393.259" y2="79.119">
      <Stop offset="0" stopColor="#decefa"/>
      <Stop offset=".341" stopColor="#e7dbfb"/>
      <Stop offset=".994" stopColor="#fff"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-125" x1="403.439" y1="84.678" x2="392.411" y2="84.521">
      <Stop offset="0" stopColor="#decefa"/>
      <Stop offset=".341" stopColor="#e7dbfb"/>
      <Stop offset=".994" stopColor="#fff"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-126" x1="400.023" y1="189.233" x2="400.023" y2="106.594">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <ClipPath id="clippath-6">
      <Rect x="367.595" y="75.334" width="19.72" height="19.72" fill="none"/>
      </ClipPath>
      <LinearGradient id="linear-gradient-127" y1="99.268" y2="76.538">
      <Stop offset=".117" stopColor="#a1f7cf"/>
      <Stop offset=".562" stopColor="#8ce6bc"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-128" y1="94.708" y2="80.015" gradientTransform="translate(331.56 -279.929) rotate(69.701)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".105" stopColor="#f8fed8"/>
      <Stop offset=".308" stopColor="#f8fdd8"/>
      <Stop offset=".587" stopColor="#f1fcaa"/>
      <Stop offset=".929" stopColor="#e1f94a"/>
      <Stop offset="1" stopColor="#def834"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-129" x1="381.122" y1="99.268" x2="381.122" y2="76.538" gradientTransform="translate(72.679 -145.646) rotate(23.853)">
      <Stop offset=".117" stopColor="#a1f7cf"/>
      <Stop offset=".562" stopColor="#8ce6bc"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-130" x1="566.541" y1="205.718" x2="566.541" y2="195.295" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-131" x1="605.495" y1="129.59" x2="605.495" y2="115.954">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-132" x1="468.984" y1="56.824" x2="468.984" y2="41.541" gradientTransform="translate(441.858 -421.934) rotate(80.761)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-133" x1="664.44" y1="283.191" x2="664.44" y2="223.397" gradientTransform="translate(-24.851) skewX(7.835)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-134" x1="638.864" y1="283.191" x2="638.864" y2="223.397" gradientTransform="translate(-24.851) skewX(7.835)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-135" x1="613.288" y1="283.637" x2="613.288" y2="197.185" gradientTransform="translate(-24.851) skewX(7.835)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset="1" stopColor="#a77bf2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-136" x1="623.793" y1="190.251" x2="695.084" y2="192.347">
      <Stop offset=".106" stopColor="#b03a37"/>
      <Stop offset=".413" stopColor="#c04e47"/>
      <Stop offset=".98" stopColor="#e87d6f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-137" x1="623.766" y1="191.158" x2="695.058" y2="193.254">
      <Stop offset=".106" stopColor="#b03a37"/>
      <Stop offset=".413" stopColor="#c04e47"/>
      <Stop offset=".98" stopColor="#e87d6f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-138" x1="607.745" y1="223.661" x2="607.745" y2="179.995">
      <Stop offset=".106" stopColor="#b03a37"/>
      <Stop offset=".413" stopColor="#c04e47"/>
      <Stop offset=".98" stopColor="#e87d6f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-139" x1="640.008" y1="250.101" x2="640.008" y2="279.356" gradientTransform="translate(-24.851) skewX(7.835)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-140" x1="689.216" y1="258.709" x2="632.17" y2="259.772" gradientTransform="translate(-24.851) skewX(7.835)">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-141" x1="630.275" y1="186.067" x2="630.275" y2="231.75" gradientTransform="translate(-24.851) skewX(7.835)" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#3d2763"/>
      <Stop offset=".994" stopColor="#23143d"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-142" x1="654.875" x2="654.875">
      <Stop offset="0" stopColor="#3d2763"/>
      <Stop offset=".994" stopColor="#23143d"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-143" x1="636.731" y1="231.623" x2="636.731" y2="241.499" gradientTransform="translate(-24.851) skewX(7.835)" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".132" stopColor="#faffd6"/>
      <Stop offset=".336" stopColor="#faffd6"/>
      <Stop offset=".585" stopColor="#faffd6"/>
      <Stop offset=".868" stopColor="#f5ffb6"/>
      <Stop offset=".995" stopColor="#f2ff9b"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-144" x1="636.22" y1="231.623" x2="636.22" y2="241.501">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".132" stopColor="#faffd6"/>
      <Stop offset=".336" stopColor="#faffd6"/>
      <Stop offset=".585" stopColor="#faffd6"/>
      <Stop offset=".868" stopColor="#f5ffb6"/>
      <Stop offset=".995" stopColor="#f2ff9b"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-145" x1="637.318" y1="230.753" x2="637.318" y2="241.771" gradientTransform="translate(-24.851) skewX(7.835)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-146" x1="660.64" y1="231.623" x2="660.64" y2="241.501">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".132" stopColor="#faffd6"/>
      <Stop offset=".336" stopColor="#faffd6"/>
      <Stop offset=".585" stopColor="#faffd6"/>
      <Stop offset=".868" stopColor="#f5ffb6"/>
      <Stop offset=".995" stopColor="#f2ff9b"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-147" x1="661.225" y1="231.623" x2="661.225" y2="241.498">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".132" stopColor="#faffd6"/>
      <Stop offset=".336" stopColor="#faffd6"/>
      <Stop offset=".585" stopColor="#faffd6"/>
      <Stop offset=".868" stopColor="#f5ffb6"/>
      <Stop offset=".995" stopColor="#f2ff9b"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-148" x1="661.738" y1="230.753" x2="661.738" y2="241.771" gradientTransform="translate(-24.851) skewX(7.835)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-149" x1="60.995" y1="190.447" x2="138.061" y2="189.068">
      <Stop offset=".106" stopColor="#b03a37"/>
      <Stop offset=".413" stopColor="#c04e47"/>
      <Stop offset=".98" stopColor="#e87d6f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-150" x1="60.987" y1="189.986" x2="138.053" y2="188.608">
      <Stop offset=".106" stopColor="#b03a37"/>
      <Stop offset=".413" stopColor="#c04e47"/>
      <Stop offset=".98" stopColor="#e87d6f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-151" x1="57.957" y1="179.895" x2="57.957" y2="204.72">
      <Stop offset=".117" stopColor="#a1f7cf"/>
      <Stop offset=".562" stopColor="#8ce6bc"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-152" x1="-9.263" y1="276.523" x2="314.818" y2="262.699">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".142" stopColor="#f5f1fb"/>
      <Stop offset=".415" stopColor="#daccf2"/>
      <Stop offset=".788" stopColor="#b092e4"/>
      <Stop offset=".994" stopColor="#9870dc"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-153" x1="54.096" y1="136.246" x2="58.099" y2="122.152">
      <Stop offset="0" stopColor="#e5d8fb"/>
      <Stop offset=".137" stopColor="#dacaf7"/>
      <Stop offset=".4" stopColor="#c0a5ef"/>
      <Stop offset=".76" stopColor="#976be2"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-154" x1="63.504" y1="155.158" x2="63.504" y2="118.255">
      <Stop offset="0" stopColor="#e5d8fb"/>
      <Stop offset=".137" stopColor="#dacaf7"/>
      <Stop offset=".4" stopColor="#c0a5ef"/>
      <Stop offset=".76" stopColor="#976be2"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <ClipPath id="clippath-7">
      <Path d="M88.252,107.335h-5.945l8.651-26.614-28.937-10.683-28.053,5.332,9.737,31.965h-4.951c-.93,0-1.683.754-1.683,1.683v30.766c0,.93.754,1.683,1.683,1.683h49.497c.93,0,1.683-.754,1.683-1.683v-30.766c0-.93-.754-1.683-1.683-1.683Z" fill="none"/>
      </ClipPath>
      <LinearGradient id="linear-gradient-155" x1="37.072" y1="115.868" x2="89.935" y2="115.868" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#3d2763"/>
      <Stop offset=".994" stopColor="#23143d"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-156" x1="69.07" y1="117.692" x2="73.388" y2="98.433">
      <Stop offset="0" stopColor="#e5d8fb"/>
      <Stop offset=".137" stopColor="#dacaf7"/>
      <Stop offset=".4" stopColor="#c0a5ef"/>
      <Stop offset=".76" stopColor="#976be2"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-157" x1="201.276" y1="223.074" x2="205.785" y2="-30.237">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-158" x1="201.276" y1="223.074" x2="205.785" y2="-30.237">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <ClipPath id="clippath-8">
      <Path d="M235.749,212.178h-86.193c-3.874,0-6.651-3.141-6.202-7.015l19.206-165.657c.449-3.874,3.954-7.015,7.828-7.015h86.192c3.874,0,6.651,3.141,6.202,7.015l-19.206,165.657c-.449,3.874-3.954,7.015-7.828,7.015Z" fill="url(#linear-gradient-158)"/>
      </ClipPath>
      <LinearGradient id="linear-gradient-159" x1="187.809" y1="217.601" x2="200.765" y2="21.191" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-160" x1="188.983" y1="217.678" x2="201.939" y2="21.267" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-161" x1="199.708" y1="218.386" x2="212.664" y2="21.976" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-162" x1="169.227" y1="216.375" x2="182.183" y2="19.964" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-163" x1="176.468" y1="216.853" x2="189.424" y2="20.442" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-164" x1="196.454" y1="218.172" x2="209.41" y2="21.761" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-165" x1="226.312" y1="220.14" x2="239.268" y2="23.731" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-166" x1="160.836" y1="215.821" x2="173.792" y2="19.411" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-167" x1="201.093" y1="60.947" x2="202.221" y2="95.058">
      <Stop offset=".117" stopColor="#a1f7cf"/>
      <Stop offset=".562" stopColor="#8ce6bc"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-168" x1="156.966" y1="89.871" x2="169.52" y2="137.646" gradientTransform="translate(328.502 -28.665) rotate(170.415) scale(1 -1)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-169" x1="162.323" y1="55.227" x2="161.041" y2="76.626" gradientTransform="translate(10.363 27.195) rotate(-10.019) scale(1.02 .98) skewX(-6.086)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-170" x1="183.544" y1="182.722" x2="182.468" y2="200.686" gradientTransform="translate(402.513 29.759) rotate(-169.102) scale(1.02 -.98) skewX(-6.085)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-171" x1="120.603" y1="154.765" x2="131.83" y2="178.728" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-172" x1="138.947" y1="278.453" x2="138.595" y2="271.738" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#23143d"/>
      <Stop offset="1" stopColor="#482e75"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-173" x1="661.842" y1="278.033" x2="661.379" y2="269.201" gradientTransform="translate(834.928) rotate(-180) scale(1 -1)">
      <Stop offset="0" stopColor="#23143d"/>
      <Stop offset="1" stopColor="#482e75"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-174" x1="139.753" y1="163.766" x2="139.753" y2="269.594" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#261c38"/>
      <Stop offset=".146" stopColor="#2a1f3e"/>
      <Stop offset=".369" stopColor="#372852"/>
      <Stop offset=".641" stopColor="#4d3773"/>
      <Stop offset=".949" stopColor="#6b4ba1"/>
      <Stop offset="1" stopColor="#7150a9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-175" x1="119.792" y1="155.145" x2="131.019" y2="179.108">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-176" x1="157.064" y1="163.766" x2="157.064" y2="269.594" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#261c38"/>
      <Stop offset=".146" stopColor="#2a1f3e"/>
      <Stop offset=".369" stopColor="#372852"/>
      <Stop offset=".641" stopColor="#4d3773"/>
      <Stop offset=".949" stopColor="#6b4ba1"/>
      <Stop offset="1" stopColor="#7150a9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-177" x1="116.787" y1="156.553" x2="128.013" y2="180.516">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-178" x1="117.868" y1="156.046" x2="129.095" y2="180.009">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-179" x1="118.983" y1="155.523" x2="130.21" y2="179.487">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-180" x1="120.976" y1="154.59" x2="132.202" y2="178.553">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-181" x1="122.682" y1="153.791" x2="133.908" y2="177.754">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-182" x1="148.106" y1="110.212" x2="148.454" y2="132.426" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#3d2763"/>
      <Stop offset=".994" stopColor="#23143d"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-183" x1="139.532" y1="110.346" x2="139.881" y2="132.56" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#3d2763"/>
      <Stop offset=".994" stopColor="#23143d"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-184" x1="152.841" y1="110.137" x2="153.189" y2="132.352" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#3d2763"/>
      <Stop offset=".994" stopColor="#23143d"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-185" x1="148.44" y1="110.206" x2="148.788" y2="132.421" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#3d2763"/>
      <Stop offset=".994" stopColor="#23143d"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-186" x1="146.075" y1="167.781" x2="142.565" y2="124.048">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-187" x1="136.14" y1="110.399" x2="136.488" y2="132.613" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#3d2763"/>
      <Stop offset=".994" stopColor="#23143d"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-188" x1="142.748" y1="110.296" x2="143.097" y2="132.51" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#3d2763"/>
      <Stop offset=".994" stopColor="#23143d"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-189" x1="169.584" y1="129.309" x2="173.317" y2="118.827" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#261c38"/>
      <Stop offset=".146" stopColor="#2a1f3e"/>
      <Stop offset=".369" stopColor="#372852"/>
      <Stop offset=".641" stopColor="#4d3773"/>
      <Stop offset=".949" stopColor="#6b4ba1"/>
      <Stop offset="1" stopColor="#7150a9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-190" x1="171.268" y1="135.151" x2="172.908" y2="122.117">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-191" x1="170.143" y1="135.009" x2="171.783" y2="121.975">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-192" x1="169.847" y1="134.972" x2="171.487" y2="121.938">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-193" x1="170.03" y1="134.995" x2="171.67" y2="121.961">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-194" x1="169.543" y1="134.934" x2="171.183" y2="121.9">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-195" x1="126.149" y1="168.851" x2="122.686" y2="125.702">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-196" x1="164.849" y1="166.275" x2="161.34" y2="122.541">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-197" x1="174.346" y1="139.481" x2="174.355" y2="139.306">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-198" x1="139.199" y1="128.19" x2="141.377" y2="141.013">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-199" x1="146.234" y1="127.327" x2="148.412" y2="140.15">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-200" x1="143.313" y1="127.491" x2="145.491" y2="140.315">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-201" x1="143.148" y1="126.897" x2="142.144" y2="153.42">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".018" stopColor="#faf8fd"/>
      <Stop offset=".148" stopColor="#dbccf6"/>
      <Stop offset=".282" stopColor="#c1a5f0"/>
      <Stop offset=".417" stopColor="#ab86eb"/>
      <Stop offset=".555" stopColor="#9a6de7"/>
      <Stop offset=".694" stopColor="#8e5ce4"/>
      <Stop offset=".839" stopColor="#8752e2"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-202" x1="143.498" y1="135.886" x2="142.871" y2="113.606">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-203" x1="145.403" y1="140.471" x2="144.615" y2="112.438">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-204" x1="143.745" y1="110.28" x2="144.093" y2="132.494" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#3d2763"/>
      <Stop offset=".994" stopColor="#23143d"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-205" x1="140.363" y1="140.612" x2="139.575" y2="112.579" gradientTransform="translate(123.21 -64.681) rotate(45)">
      <Stop offset="0" stopColor="#bd4b4a"/>
      <Stop offset=".201" stopColor="#c35451"/>
      <Stop offset=".532" stopColor="#d36d64"/>
      <Stop offset=".952" stopColor="#ee9584"/>
      <Stop offset="1" stopColor="#f29b88"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-206" x1="163.386" y1="163.766" x2="163.386" y2="269.594" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#261c38"/>
      <Stop offset=".146" stopColor="#2a1f3e"/>
      <Stop offset=".369" stopColor="#372852"/>
      <Stop offset=".641" stopColor="#4d3773"/>
      <Stop offset=".949" stopColor="#6b4ba1"/>
      <Stop offset="1" stopColor="#7150a9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-207" x1="136.006" y1="163.766" x2="136.006" y2="269.594" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#261c38"/>
      <Stop offset=".146" stopColor="#2a1f3e"/>
      <Stop offset=".369" stopColor="#372852"/>
      <Stop offset=".641" stopColor="#4d3773"/>
      <Stop offset=".949" stopColor="#6b4ba1"/>
      <Stop offset="1" stopColor="#7150a9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-208" x1="321.226" y1="270.449" x2="200.948" y2="269.285">
      <Stop offset="0" stopColor="#23143d"/>
      <Stop offset="1" stopColor="#482e75"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-209" x1="321.234" y1="269.68" x2="200.956" y2="268.516" gradientTransform="translate(125.581 -102.934) rotate(22.123)">
      <Stop offset="0" stopColor="#23143d"/>
      <Stop offset="1" stopColor="#482e75"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-210" x1="353.716" y1="274.86" x2="267.654" y2="148.531">
      <Stop offset=".106" stopColor="#b03a37"/>
      <Stop offset=".413" stopColor="#c04e47"/>
      <Stop offset=".98" stopColor="#e87d6f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-211" x1="296.304" y1="193.465" x2="278.42" y2="235.082">
      <Stop offset="0" stopColor="#e5d8fb"/>
      <Stop offset=".137" stopColor="#dacaf7"/>
      <Stop offset=".4" stopColor="#c0a5ef"/>
      <Stop offset=".76" stopColor="#976be2"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-212" x1="311.724" y1="303.467" x2="225.663" y2="177.138">
      <Stop offset=".106" stopColor="#b03a37"/>
      <Stop offset=".413" stopColor="#c04e47"/>
      <Stop offset=".98" stopColor="#e87d6f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-213" x1="199.693" y1="211.413" x2="294.662" y2="253.65">
      <Stop offset=".117" stopColor="#a1f7cf"/>
      <Stop offset=".562" stopColor="#8ce6bc"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-214" x1="191.859" y1="229.028" x2="286.828" y2="271.265">
      <Stop offset=".117" stopColor="#a1f7cf"/>
      <Stop offset=".562" stopColor="#8ce6bc"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-215" x1="225.34" y1="262.965" x2="166.123" y2="262.639">
      <Stop offset=".106" stopColor="#b03a37"/>
      <Stop offset=".413" stopColor="#c04e47"/>
      <Stop offset=".98" stopColor="#e87d6f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-216" x1="321.223" y1="270.756" x2="200.945" y2="269.592">
      <Stop offset="0" stopColor="#23143d"/>
      <Stop offset="1" stopColor="#482e75"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-217" x1="198.535" y1="214.016" x2="293.504" y2="256.253">
      <Stop offset=".117" stopColor="#a1f7cf"/>
      <Stop offset=".562" stopColor="#8ce6bc"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-218" x1="343.036" y1="282.135" x2="256.975" y2="155.807">
      <Stop offset=".106" stopColor="#b03a37"/>
      <Stop offset=".413" stopColor="#c04e47"/>
      <Stop offset=".98" stopColor="#e87d6f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-219" x1="187.829" y1="238.091" x2="282.797" y2="280.327">
      <Stop offset=".117" stopColor="#a1f7cf"/>
      <Stop offset=".562" stopColor="#8ce6bc"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-220" x1="178.455" y1="259.168" x2="273.423" y2="301.404" gradientTransform="translate(396.497 535.352) rotate(180)">
      <Stop offset=".117" stopColor="#a1f7cf"/>
      <Stop offset=".562" stopColor="#8ce6bc"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-221" x1="321.231" y1="269.987" x2="200.953" y2="268.823">
      <Stop offset="0" stopColor="#23143d"/>
      <Stop offset="1" stopColor="#482e75"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-222" x1="321.408" y1="251.702" x2="201.13" y2="250.538">
      <Stop offset="0" stopColor="#23143d"/>
      <Stop offset="1" stopColor="#482e75"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-223" x1="225.35" y1="261.154" x2="166.133" y2="260.828" gradientTransform="translate(396.48 522.009) rotate(-180)">
      <Stop offset=".106" stopColor="#b03a37"/>
      <Stop offset=".413" stopColor="#c04e47"/>
      <Stop offset=".98" stopColor="#e87d6f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-224" x1="298.535" y1="252.198" x2="302.759" y2="252.198">
      <Stop offset="0" stopColor="#23143d"/>
      <Stop offset="1" stopColor="#482e75"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-225" x1="192.274" y1="252.199" x2="194.373" y2="252.199">
      <Stop offset="0" stopColor="#23143d"/>
      <Stop offset="1" stopColor="#482e75"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-226" x1="284.65" y1="191.514" x2="265.313" y2="219.791">
      <Stop offset="0" stopColor="#e5d8fb"/>
      <Stop offset=".137" stopColor="#dacaf7"/>
      <Stop offset=".4" stopColor="#c0a5ef"/>
      <Stop offset=".76" stopColor="#976be2"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-227" x1="269.036" y1="211.828" x2="268.851" y2="244.724">
      <Stop offset=".117" stopColor="#fff"/>
      <Stop offset=".272" stopColor="#ebf8f2"/>
      <Stop offset=".589" stopColor="#bae8d3"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-228" x1="265.097" y1="211.806" x2="264.912" y2="244.702">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-229" x1="313.594" y1="211.306" x2="294.257" y2="239.584">
      <Stop offset="0" stopColor="#e5d8fb"/>
      <Stop offset=".137" stopColor="#dacaf7"/>
      <Stop offset=".4" stopColor="#c0a5ef"/>
      <Stop offset=".76" stopColor="#976be2"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-230" x1="294.417" y1="211.971" x2="294.232" y2="244.867">
      <Stop offset=".117" stopColor="#fff"/>
      <Stop offset=".272" stopColor="#ebf8f2"/>
      <Stop offset=".589" stopColor="#bae8d3"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-231" x1="291.538" y1="211.955" x2="291.353" y2="244.851">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-232" x1="204.759" y1="200.022" x2="299.728" y2="242.259">
      <Stop offset=".117" stopColor="#a1f7cf"/>
      <Stop offset=".562" stopColor="#8ce6bc"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-233" x1="229.898" y1="211.608" x2="229.713" y2="244.504">
      <Stop offset=".117" stopColor="#fff"/>
      <Stop offset=".272" stopColor="#ebf8f2"/>
      <Stop offset=".589" stopColor="#bae8d3"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-234" x1="225.48" y1="211.584" x2="225.295" y2="244.48">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-235" x1="293.809" y1="197.777" x2="274.473" y2="226.054">
      <Stop offset="0" stopColor="#e5d8fb"/>
      <Stop offset=".137" stopColor="#dacaf7"/>
      <Stop offset=".4" stopColor="#c0a5ef"/>
      <Stop offset=".76" stopColor="#976be2"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-236" x1="279.334" y1="211.886" x2="279.149" y2="244.782">
      <Stop offset=".117" stopColor="#fff"/>
      <Stop offset=".272" stopColor="#ebf8f2"/>
      <Stop offset=".589" stopColor="#bae8d3"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-237" x1="276.557" y1="211.871" x2="276.372" y2="244.767">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-238" x1="209.451" y1="211.494" x2="209.267" y2="244.39">
      <Stop offset=".117" stopColor="#fff"/>
      <Stop offset=".272" stopColor="#ebf8f2"/>
      <Stop offset=".589" stopColor="#bae8d3"/>
      <Stop offset=".98" stopColor="#76d3a8"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-239" x1="209.921" y1="211.496" x2="209.736" y2="244.392">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-240" x1="276.434" y1="73.316" x2="271.462" y2="178.087">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-241" x1="231.946" y1="92.164" x2="231.946" y2="68.419" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#3d2763"/>
      <Stop offset=".994" stopColor="#23143d"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-242" x1="256.464" y1="74.483" x2="302.643" y2="74.483" gradientTransform="translate(24.544) skewX(-6.611)" gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".587" stopColor="#b595ed"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-243" x1="256.464" y1="69.387" x2="302.644" y2="69.387">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".587" stopColor="#b595ed"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-244" x1="249.068" y1="83.431" x2="256.418" y2="83.431" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-245" x1="258.91" y1="83.431" x2="266.259" y2="83.431" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-246" x1="268.751" y1="83.431" x2="276.101" y2="83.431" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-247" x1="278.593" y1="83.431" x2="285.943" y2="83.431" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-248" x1="288.435" y1="83.431" x2="295.784" y2="83.431" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-249" x1="270.144" y1="73.857" x2="265.172" y2="178.628">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-250" x1="228.849" y1="138.446" x2="228.849" y2="114.702" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#3d2763"/>
      <Stop offset=".994" stopColor="#23143d"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-251" x1="249.49" y1="120.765" x2="271.46" y2="120.765">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".587" stopColor="#b595ed"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-252" x1="253.367" y1="115.669" x2="299.547" y2="115.669">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".587" stopColor="#b595ed"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-253" x1="245.971" y1="129.714" x2="253.321" y2="129.714" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-254" x1="255.813" y1="129.714" x2="263.163" y2="129.714" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-255" x1="265.655" y1="129.714" x2="273.004" y2="129.714" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-256" x1="275.245" y1="129.714" x2="283.097" y2="129.714" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-257" x1="285.086" y1="129.714" x2="292.939" y2="129.714" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-258" x1="267.029" y1="73.709" x2="262.056" y2="178.481">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-259" x1="228.848" y1="184.04" x2="228.848" y2="160.296" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#3d2763"/>
      <Stop offset=".994" stopColor="#23143d"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-260" x1="254.433" y1="166.359" x2="307.279" y2="166.359">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".587" stopColor="#b595ed"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-261" x1="248.231" y1="161.263" x2="262.352" y2="161.263">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".587" stopColor="#b595ed"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-262" x1="245.969" y1="175.308" x2="253.319" y2="175.308" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-263" x1="255.811" y1="175.308" x2="263.161" y2="175.308" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-264" x1="265.401" y1="175.307" x2="273.254" y2="175.307" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-265" x1="275.243" y1="175.307" x2="283.095" y2="175.307" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-266" x1="285.085" y1="175.307" x2="292.937" y2="175.307" gradientTransform="translate(24.544) skewX(-6.611)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".138" stopColor="#f1ff93"/>
      <Stop offset=".35" stopColor="#ecfe78"/>
      <Stop offset=".609" stopColor="#e4fb50"/>
      <Stop offset=".904" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-267" x1="77.381" y1="145.738" x2="77.381" y2="88.027">
      <Stop offset="0" stopColor="#e5d8fb"/>
      <Stop offset=".137" stopColor="#dacaf7"/>
      <Stop offset=".4" stopColor="#c0a5ef"/>
      <Stop offset=".76" stopColor="#976be2"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <ClipPath id="clippath-9">
      <Path d="M105.224,88.803h-6.688l9.733-29.942-32.555-12.019-31.56,5.999,10.955,35.962h-5.57c-1.046,0-1.894.848-1.894,1.894v34.613c0,1.046.848,1.894,1.894,1.894h55.686c1.046,0,1.894-.848,1.894-1.894v-34.613c0-1.046-.848-1.894-1.894-1.894Z" fill="none"/>
      </ClipPath>
      <LinearGradient id="linear-gradient-268" x1="47.645" y1="98.403" x2="107.118" y2="98.403" gradientTransform="matrix(1,0,0,1,0,0)">
      <Stop offset="0" stopColor="#3d2763"/>
      <Stop offset=".994" stopColor="#23143d"/>
      </LinearGradient>
      <ClipPath id="clippath-10">
      <Polygon points="77.381 108.003 36.195 81.41 41.407 81.954 52.239 50.754 111.969 48.407 98.008 87.853 107.118 88.803 77.381 108.003" fill="none"/>
      </ClipPath>
      <LinearGradient id="linear-gradient-269" x1="73.824" y1="109.84" x2="67.836" y2="72.07" gradientTransform="translate(18.833 -11.44) rotate(10.632)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-270" x1="76.254" y1="64.547" x2="49.334" y2="70.219" gradientTransform="translate(-3.839 4.215) rotate(-3.268)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-271" x1="37.839" y1="73.075" x2="93.365" y2="60.718" gradientTransform="translate(13.606 -8.848) rotate(10.631)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-272" x1="37.844" y1="73.125" x2="93.385" y2="60.765" gradientTransform="translate(13.564 -9.209) rotate(10.632)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-273" x1="37.866" y1="73.189" x2="93.388" y2="60.833" gradientTransform="translate(13.505 -9.691) rotate(10.632)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-274" x1="37.876" y1="73.257" x2="93.408" y2="60.899" gradientTransform="translate(13.447 -10.186) rotate(10.634)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-275" x1="37.892" y1="73.315" x2="93.417" y2="60.958" gradientTransform="translate(13.391 -10.614) rotate(10.631)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-276" x1="37.893" y1="73.364" x2="93.436" y2="61.004" gradientTransform="translate(13.35 -10.964) rotate(10.632)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-277" x1="37.914" y1="73.414" x2="93.439" y2="61.058" gradientTransform="translate(13.301 -11.345) rotate(10.631)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-278" x1="37.918" y1="73.461" x2="93.453" y2="61.102" gradientTransform="translate(13.267 -11.684) rotate(10.636)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-279" x1="37.937" y1="73.515" x2="93.46" y2="61.159" gradientTransform="translate(13.212 -12.091) rotate(10.632)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-280" x1="37.954" y1="73.598" x2="93.479" y2="61.242" gradientTransform="translate(13.141 -12.703) rotate(10.634)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-281" x1="62.376" y1="118.977" x2="61.879" y2="78.074" gradientTransform="translate(-18.076 18.534) rotate(-13.899)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-282" x1="66.586" y1="118.926" x2="66.089" y2="78.023" gradientTransform="translate(-18.076 18.534) rotate(-13.899)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-283" x1="74.381" y1="118.831" x2="73.885" y2="77.928" gradientTransform="translate(5.404 -2.414)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-284" x1="74.657" y1="118.828" x2="74.161" y2="77.925" gradientTransform="translate(-.061 -1.756)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-285" x1="78.223" y1="118.784" x2="77.727" y2="77.881" gradientTransform="translate(6.906 -3.553)">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-286" x1="80.68" y1="106.009" x2="85.962" y2="65.576" gradientTransform="translate(-15.091 15.491) rotate(-9.876)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".283" stopColor="#ecfe76"/>
      <Stop offset=".903" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-287" x1="99.502" y1="71.553" x2="70.906" y2="71.553" gradientTransform="translate(16.116 -12.494) rotate(9.875)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-288" x1="69.366" y1="118.864" x2="76.68" y2="82.494">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".283" stopColor="#ecfe76"/>
      <Stop offset=".903" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-289" x1="73.955" y1="119.787" x2="81.27" y2="83.418">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".283" stopColor="#ecfe76"/>
      <Stop offset=".903" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-290" x1="81.449" y1="121.294" x2="88.763" y2="84.925" gradientTransform="translate(-17.991 15.953) rotate(-9.878)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".283" stopColor="#ecfe76"/>
      <Stop offset=".903" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-291" x1="80.865" y1="121.177" x2="88.179" y2="84.807" gradientTransform="translate(-14.072 16.284) rotate(-9.875)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".283" stopColor="#ecfe76"/>
      <Stop offset=".903" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-292" x1="85.467" y1="122.102" x2="92.781" y2="85.733" gradientTransform="translate(-19.2 16.522) rotate(-9.876)">
      <Stop offset="0" stopColor="#f2ff9e"/>
      <Stop offset=".283" stopColor="#ecfe76"/>
      <Stop offset=".903" stopColor="#defe11"/>
      <Stop offset=".911" stopColor="#dfff0f"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-293" x1="92.705" y1="270.779" x2="92.705" y2="281.984" gradientTransform="translate(29.6) skewX(-6.056)">
      <Stop offset="0" stopColor="#23143d"/>
      <Stop offset="1" stopColor="#482e75"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-294" x1="70.086" y1="270.779" x2="70.086" y2="281.984" gradientTransform="translate(29.6) skewX(-6.056)">
      <Stop offset="0" stopColor="#23143d"/>
      <Stop offset="1" stopColor="#482e75"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-295" x1="87.839" y1="267.429" x2="87.839" y2="189.434" gradientTransform="translate(29.6) skewX(-6.056)">
      <Stop offset="0" stopColor="#261c38"/>
      <Stop offset=".146" stopColor="#2a1f3e"/>
      <Stop offset=".369" stopColor="#372852"/>
      <Stop offset=".641" stopColor="#4d3773"/>
      <Stop offset=".949" stopColor="#6b4ba1"/>
      <Stop offset="1" stopColor="#7150a9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-296" x1="56.096" y1="156.523" x2="85.364" y2="267.904" gradientTransform="translate(29.6) skewX(-6.056)">
      <Stop offset="0" stopColor="#6337b0"/>
      <Stop offset=".994" stopColor="#8046e5"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-297" x1="51.284" y1="169.167" x2="88.879" y2="169.167">
      <Stop offset="0" stopColor="#fff"/>
      <Stop offset=".267" stopColor="#d4c2f4"/>
      <Stop offset=".512" stopColor="#b290ec"/>
      <Stop offset=".723" stopColor="#996ce7"/>
      <Stop offset=".89" stopColor="#8a56e3"/>
      <Stop offset=".994" stopColor="#854fe2"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-298" x1="89.211" y1="194.304" x2="89.211" y2="162.194">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-299" x1="105.69" y1="44.356" x2="130.639" y2="76.982">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-300" x1="103.018" y1="46.4" x2="127.967" y2="79.026">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-301" x1="109.22" y1="41.657" x2="134.169" y2="74.283">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      <LinearGradient id="linear-gradient-302" x1="97.76" y1="50.42" x2="122.71" y2="83.046">
      <Stop offset="0" stopColor="#c3a5f6"/>
      <Stop offset=".195" stopColor="#b897f1"/>
      <Stop offset=".569" stopColor="#9c72e6"/>
      <Stop offset=".994" stopColor="#7942d9"/>
      </LinearGradient>
      </Defs><G id="_x31_">
      <G>
      <Path d="M100.593,135.186c-7.599,0-16.382-2.206-24.612-7.729-.115-.077-.145-.232-.068-.347.078-.115.234-.145.347-.068,13.29,8.917,28.012,9.094,36.708,5.313,5.82-2.53,9.492-6.823,10.339-12.088,1.817-11.29-6.185-18.713-12.362-23.314-11.216-8.356-33.669-22.069-58.02-20.026-4.63.388-10.754,1.764-13.635,6.115-.077.115-.232.146-.347.07-.115-.076-.146-.231-.07-.347,2.992-4.517,9.27-5.939,14.01-6.337,24.514-2.062,47.088,11.726,58.361,20.123,6.281,4.679,14.417,12.237,12.557,23.795-.876,5.44-4.652,9.867-10.633,12.468-3.421,1.487-7.76,2.372-12.574,2.372Z" fill="#23143d"/>
      <G>
      <Path d="M116.974,185.563c2.727,6.111.879,12.876-4.128,15.11-5.007,2.234-11.276-.909-14.003-7.02-2.727-6.111-.879-12.876,4.128-15.11s11.276.909,14.003,7.02Z" fill="url(#linear-gradient-149)"/>
      <Polygon points="108.137 201.383 58.662 201.383 56.223 177.832 105.699 177.832 108.137 201.383" fill="url(#linear-gradient-150)"/>
      <Path d="M67.022,185.563c2.727,6.111.879,12.876-4.128,15.11-5.007,2.234-11.276-.909-14.003-7.02-2.727-6.111-.879-12.876,4.128-15.11,5.007-2.234,11.276.909,14.003,7.02Z" fill="url(#linear-gradient-151)"/>
      <Path d="M76.472,201.664c-.164,0-.332-.086-.33-.252.002-.138.113-.248.25-.248.013-.006.053,0,.08,0,1.17,0,2.295-.236,3.345-.705,4.928-2.198,6.743-8.904,4.047-14.947-2.158-4.834-6.567-7.931-10.965-7.663-.138.012-.256-.098-.264-.235-.008-.139.098-.257.235-.265,4.608-.253,9.209,2.938,11.451,7.96,2.809,6.295.879,13.296-4.3,15.607-1.114.497-2.308.748-3.548.748Z" fill="#23143d"/>
      <Path d="M94.806,201.664c-.164,0-.331-.086-.33-.252.002-.138.113-.248.25-.248.004-.006.052,0,.08,0,1.17,0,2.295-.236,3.345-.705,4.928-2.198,6.743-8.904,4.047-14.947-2.157-4.834-6.572-7.931-10.965-7.663-.142.012-.256-.098-.264-.235-.008-.139.098-.257.235-.265,4.613-.253,9.209,2.938,11.451,7.96,2.809,6.295.879,13.296-4.3,15.607-1.114.497-2.308.748-3.548.748Z" fill="#23143d"/>
      </G>
      <Path d="M323.902,280.114H35.58c22.411-1.555,27.501-10.16,47.454-10.803,5.133-.165,10.046.467,14.532,1.31,13.718,2.591,27.555.326,39.662-4.776,10.786-4.547,19.836-12.199,38.515-14.811,14.539-2.034,34.034,3.134,46.913,13.068,8.284,6.389,21.383,5.37,32.475,3.484,5.241-.893,11.007-1.247,17.043-1.39,25.714-.609,35.231,11.161,51.728,13.918Z" fill="url(#linear-gradient-152)"/>
      <Polygon points="31.167 121.442 37.258 108.25 89.33 107.726 31.167 121.442" fill="url(#linear-gradient-153)"/>
      <Rect x="37.072" y="107.335" width="52.863" height="34.133" rx="1.683" ry="1.683" fill="url(#linear-gradient-154)"/>
      <G clipPath="url(#clippath-7)">
      <Polygon points="63.504 124.401 37.072 107.335 89.935 107.335 63.504 124.401" fill="url(#linear-gradient-155)"/>
      </G>
      <Polygon points="41.002 104.674 47.854 89.832 106.436 89.243 41.002 104.674" fill="url(#linear-gradient-156)"/>
      <G>
      <G>
      <Path d="M235.749,212.178h-86.193c-3.874,0-6.651-3.141-6.202-7.015l19.206-165.657c.449-3.874,3.954-7.015,7.828-7.015h86.192c3.874,0,6.651,3.141,6.202,7.015l-19.206,165.657c-.449,3.874-3.954,7.015-7.828,7.015Z" fill="url(#linear-gradient-157)"/>
      <G clipPath="url(#clippath-8)">
      <Polygon points="145.605 81.946 145.137 74.27 283.772 50.225 284.24 57.901 145.605 81.946" fill="url(#linear-gradient-159)"/>
      <Polygon points="257.211 178.012 137.404 152.241 139.889 144.611 259.696 170.382 257.211 178.012" fill="url(#linear-gradient-160)"/>
      <Polygon points="218.338 221.037 199.021 67.643 206.81 65.81 226.128 219.203 218.338 221.037" fill="url(#linear-gradient-161)"/>
      <Polygon points="166.511 228.659 158.986 227.322 179.521 156.559 187.046 157.897 166.511 228.659" fill="url(#linear-gradient-162)"/>
      <Polygon points="142.182 194.001 143.48 186.202 218.864 188.643 217.565 196.442 142.182 194.001" fill="url(#linear-gradient-163)"/>
      <Polygon points="282.107 108.137 151.034 98.132 152.574 90.363 283.646 100.368 282.107 108.137" fill="url(#linear-gradient-164)"/>
      <Polygon points="214.189 137.492 213.213 129.92 270.412 116.296 271.388 123.868 214.189 137.492" fill="url(#linear-gradient-165)"/>
      <Polygon points="198.452 68.62 190.632 70.171 185.748 14.051 193.567 12.501 198.452 68.62" fill="url(#linear-gradient-166)"/>
      </G>
      </G>
      <Path d="M207.775,97.557c-.145,1.252-1.278,2.267-2.53,2.267s-2.149-1.015-2.004-2.267c.145-1.252,1.278-2.267,2.53-2.267s2.149,1.015,2.004,2.267Z" fill="#fff"/>
      <Path d="M179.21,71.699c-.073.626-.639,1.133-1.265,1.133s-1.075-.507-1.002-1.133c.073-.626.639-1.133,1.265-1.133s1.075.507,1.002,1.133Z" fill="#fff"/>
      <Path d="M187.891,144.172c.082,1.169-.779,2.291-1.923,2.506-1.144.215-2.138-.559-2.221-1.728-.082-1.169.779-2.291,1.923-2.506,1.144-.215,2.138.559,2.221,1.728Z" fill="#fff"/>
      <Path d="M189.195,75.257c.615,2.204,1.669,3.88,3.404,5.886l10.229,11.035c1.452,1.591,3.997,1.043,4.772-1.027l5.324-13.906c1.226-3.205,1.631-5.931,1.077-8.926-1.524-8.236-10.049-13.193-17.95-9.416-6.006,2.85-8.739,9.753-6.856,16.355ZM195.893,72.129c-.593-3.203,1.395-6.313,4.418-6.963,3.062-.659,6.004,1.39,6.597,4.593.585,3.161-1.403,6.271-4.465,6.93-3.022.65-5.965-1.398-6.55-4.56Z" fill="url(#linear-gradient-167)"/>
      <Path d="M188.86,105.775c-8.602-2.899-16.158,2.705-16.105,10.813.019,2.948.944,5.545,2.779,8.527l7.966,12.937c1.168,1.927,3.811,2.215,4.956.538l8.095-11.642c1.348-2.104,2.079-3.825,2.272-6.014.617-6.562-3.427-12.976-9.962-15.159ZM185.882,123.579c-3.18-.345-5.757-3.163-5.777-6.275-.021-3.153,2.523-5.414,5.703-5.069,3.138.341,5.715,3.158,5.736,6.311.02,3.112-2.523,5.373-5.662,5.032Z" fill="url(#linear-gradient-168)"/>
      <Path d="M170.788,59.042c.139,1.031.527,1.829,1.218,2.796l4.133,5.335c.585.769,1.847.577,2.366-.359l3.546-6.286c.817-1.449,1.205-2.696,1.151-4.091-.148-3.835-3.893-6.326-7.958-4.774-3.088,1.17-4.892,4.288-4.455,7.379ZM174.229,57.76c-.057-1.492,1.119-2.878,2.617-3.105,1.518-.23,2.787.785,2.845,2.276.057,1.472-1.119,2.859-2.638,3.089-1.498.227-2.767-.788-2.824-2.26Z" fill="url(#linear-gradient-169)"/>
      <Path d="M202.136,189.861c.053.526.522.96,1.047.968.526.008.909-.412.856-.939s-.522-.96-1.047-.968c-.525-.008-.909.412-.856.939Z" fill="#fff"/>
      <Path d="M205.723,173.095c-3.392-1.355-6.568.687-6.741,3.905-.063,1.17.247,2.222.914,3.449l2.895,5.322c.424.792,1.481.969,1.981.332l3.537-4.425c.593-.802.929-1.468,1.059-2.331.406-2.588-1.068-5.229-3.645-6.251ZM204.096,180.086c-1.271-.213-2.241-1.392-2.174-2.627.068-1.251,1.146-2.087,2.417-1.874,1.255.21,2.224,1.389,2.157,2.64-.067,1.235-1.145,2.071-2.399,1.861Z" fill="url(#linear-gradient-170)"/>
      </G>
      <G>
      <Path d="M129.061,164.493l-5.171,4.261-3.344-5.236c1.082-.866,1.648-1.742,2.445-3.37.832-1.709,1.824-3.871,1.812-5.294l4.258,9.639Z" fill="url(#linear-gradient-171)"/>
      <Path d="M137.29,272.15c-.06,4.665-2.976,5.932-2.976,5.932-.603.422-.752.804-.752,2.032h10.754l-.21-7.649s-6.779-3.123-6.815-.315Z" fill="url(#linear-gradient-172)"/>
      <Path d="M171.152,268.735c.802,1.415,1.777,5.334,4.74,7.279,2.904,1.906,5.999,2.081,5.999,2.081,1.279.049,1.658.688,1.658,2.019h-19.498l-1.252-7.502s6.727-6.745,8.353-3.877Z" fill="url(#linear-gradient-173)"/>
      <Path d="M150.936,166.884l-2.789,4.121-3.012,3.496,1.144,100.266-20.546.78c2.951-21.608,7.858-53.067,3.783-91.928-.655-6.248-.876-12.854,1.367-18.723l2.91-7.614,19.98-.364-2.838,9.967Z" fill="url(#linear-gradient-174)"/>
      <Polygon points="123.305 173.829 124.803 170.29 122.855 167.134 127.973 162.03 130.325 166.44 130.325 172.376 123.305 173.829" fill="url(#linear-gradient-175)"/>
      <Path d="M159.298,176.232l12.557,93.66-16.877,6.91c-5.023-48.81-7.64-87.433-12.687-101.045,0,0-.016-.179-.016-.179l.302-16.193,11.198-2.468,3.893,11.988c.665,2.414,1.209,4.86,1.631,7.328Z" fill="url(#linear-gradient-176)"/>
      <Path d="M159.537,186.283l.006.042h.006c-.006-.012-.012-.024-.012-.042Z" fill="#8a5230"/>
      <Path d="M126.292,172.826c-.38.552-.811,1.494-1.105,2.172-.018.037-.05.143-.032.061.1-.355-.106-.873-.413-1.05.025.016.167.102.197.118.939.535,2.044,1.083,2.966,1.725.985.695-.024,2.216-1.046,1.581-.703-.439-2.148-1.153-2.983-1.463-.707-.262-1.039-.741-.879-1.398.103-.425.442-1.001.585-1.396.378-.885,1.007-2.755,2.369-1.992.57.338.729,1.105.341,1.642h0Z" fill="url(#linear-gradient-177)"/>
      <Path d="M127.083,172.211c.519,1.261.21,2.966.691,4.012.599.747,2.485,3.396.829,3.781-.874.203-1.026-1.476-1.681-1.97-1.684-1.264-1.27-3.435-1.992-5.079-.556-1.473,1.679-2.249,2.153-.744h0Z" fill="url(#linear-gradient-178)"/>
      <Path d="M128.01,171.484c.155.602.762,4.011.99,4.51.408.945.881,1.753,1.252,2.766.31.908-.772,1.885-1.191,1.027-.36-.724-1.371-2.202-1.715-2.984-.304-.692-1.288-4.067-1.562-4.838-.423-1.563,1.957-2.083,2.227-.481h0Z" fill="url(#linear-gradient-179)"/>
      <Path d="M130.198,171.221c.028,2.259.86,3.979,1.811,6.075.468,1.043-.561,2.363-1.227,1.045-.694-1.372-4.729-7.658-1.818-8.238.654-.057,1.226.462,1.234,1.118h0Z" fill="url(#linear-gradient-180)"/>
      <Path d="M130.417,166.601c.58,1.084,1.432,1.951,1.905,3.164.36.745.305,2.192.461,3.346.067.496.079,1.168-.42,1.211-1.118.095-1.495-1.707-1.502-2.545-.184-1.371-1.619-2.114-2.79-2.755-2.621-1.622.646-4.988,2.346-2.421h0Z" fill="url(#linear-gradient-181)"/>
      <Path d="M130.727,178.358c-.041,0-.082-.021-.105-.058l-1.533-2.391c-.343-.536-.561-1.153-.628-1.786l-.278-2.596c-.007-.069.042-.131.111-.138.063-.021.13.043.138.11l.278,2.596c.064.595.268,1.176.59,1.679l1.533,2.391c.037.058.02.136-.038.173-.021.013-.044.02-.067.02Z" fill="#23143d"/>
      <Path d="M129.061,180.146c-.044,0-.086-.023-.109-.064l-1.927-3.478c-.221-.398-.344-.85-.357-1.305l-.102-3.515c-.002-.069.052-.127.122-.129h.003c.067,0,.123.054.125.121l.102,3.515c.012.416.125.828.326,1.191l1.927,3.478c.033.061.012.137-.049.17-.019.011-.04.016-.061.016Z" fill="#23143d"/>
      <Path d="M126.011,177.08c-.036,0-.072-.016-.097-.046-.058-.07-.573-.7-.664-.988-.304-.955-.095-3.885-.086-4.009.005-.069.054-.123.134-.116.069.005.121.065.115.134-.002.03-.215,3.006.075,3.915.065.206.469.724.619.906.043.053.036.132-.017.176-.023.019-.052.028-.08.028Z" fill="#23143d"/>
      <Path d="M145.27,191.619c-.068,0-.124-.054-.125-.122l-.445-18.139c-.044-1.779.971-3.414,2.585-4.165.061-.029.137-.003.166.06.029.063.002.137-.061.166-1.524.709-2.482,2.252-2.441,3.933l.445,18.139c.001.069-.053.126-.122.128h-.003Z" fill="#23143d"/>
      <Path d="M174.931,132.451c.01.079-.01.159-.06.238v.01c-.288.476-1.539.973-3.068,1.171-.109.01-.208.03-.308.03-1.112.129-2.095.05-2.631-.169-.278-.109-.437-.248-.457-.417-.04-.248.228-.516.705-.755.576-.288,1.439-.536,2.422-.665,1.747-.228,3.236,0,3.375.506.01.02.02.03.02.05Z" fill="#23143d"/>
      <Path d="M147.906,109.524s2.093,1.171,2.422,3.719c.295,2.289.212,3.807,1.837,4.592l-1.753,2.949-6.127-2.949,2.535-6.725,1.086-1.586Z" fill="url(#linear-gradient-182)"/>
      <Path d="M136.385,115.203s1.104,2.334.924,3.411c-.179,1.076-2.342,2.238-2.342,2.238l5.389,3.287s4.275-3.588,4.058-3.624c-.217-.036-4.737-7.819-4.988-7.766-.251.053-3.041,2.454-3.041,2.454Z" fill="url(#linear-gradient-183)"/>
      <Path d="M157.201,129.606c.212,1.608-1.427,3.15-3.661,3.446-2.235.295-4.218-.769-4.43-2.377s1.427-3.15,3.661-3.445c2.234-.295,4.218.769,4.43,2.376Z" fill="url(#linear-gradient-184)"/>
      <Path d="M154.538,128.384c-2.321,3.32-6.834,4.173-10.08,1.904-3.246-2.269-3.996-6.8-1.675-10.12,2.321-3.32,6.834-4.173,10.08-1.904,3.246,2.269,3.996,6.8,1.675,10.12Z" fill="url(#linear-gradient-185)"/>
      <Path d="M157.181,135.012c-.169,1.191-2.293.913-2.114,2.234,1.082,7.565-1.618,13.034-1.291,19.675l-21.412,1.535c-.151-4.549-.251-10.582-.715-16.177-.142-1.714-.387-3.971-1.449-5.619-1.886-2.958.377-7.187,5.261-7.565,5.42-.417,10.523-.258,16.757-.05,3.097.109,5.42,2.889,4.964,5.966Z" fill="url(#linear-gradient-186)"/>
      <Path d="M142.063,121.628c1.74,2.256.609,6.046-2.527,8.465-3.136,2.419-7.089,2.551-8.829.295-1.74-2.256-.609-6.046,2.527-8.465s7.089-2.551,8.829-.295Z" fill="url(#linear-gradient-187)"/>
      <Path d="M149.089,115.421c-.914,3.297-4.941,4.983-8.4,4.024-3.46-.959-4.997-4.308-4.609-7.708.583-5.105,6.306-4.779,10.219-3.095,3.498,1.506,3.705,3.481,2.79,6.779Z" fill="url(#linear-gradient-188)"/>
      <Path d="M176.231,118.643l-.33.209s-.028-.035-.07-.087l-3.975,10.048c-.11.285-.414.449-.716.395l-4.054-.775-.189.277-.35-.494-.028-.04c-.072-.119-.092-.275-.035-.417l4.061-10.257c.11-.285.409-.455.711-.396l4.319.825c.14.026.253.112.315.225l.013.023.327.465Z" fill="#23143d"/>
      <Path d="M171.522,129.752l-4.315-.822c-.285-.054-.45-.354-.343-.624l4.06-10.261c.113-.286.413-.451.715-.393l4.315.822c.285.054.45.354.343.624l-4.061,10.261c-.113.286-.413.451-.715.393Z" fill="url(#linear-gradient-189)"/>
      <Path d="M174.911,132.401c-.01.099-.02.199-.04.288v.01c-.288.476-1.539.973-3.068,1.171-1.241.169-2.353.099-2.938-.139l.248-1.171.189-.883-.417-.596c-.625-.834-.089-2.214.576-3.306.407-.675.367-1.33.367-1.33l2.521-2.303s2.998.199,3.385,1.231c.079.209-.437,3.941-.824,7.028Z" fill="url(#linear-gradient-190)"/>
      <Path d="M173.761,126.242l-2.441-3.298s-2.654-1.372-3.304-1.889c-.663-.528-.539-1.628.244-1.331l3.672,1.313c.452.162.851.445,1.153.819l2.409,2.98c.904,1.154-.788,2.531-1.734,1.406Z" fill="url(#linear-gradient-191)"/>
      <Path d="M168.368,122.615c.317-.448.914-.594,1.403-.345l4.553,2.43c.601.315.832,1.058.517,1.658-.326.628-1.128.848-1.73.477l-4.349-2.907,1.219-.171s-.932.815-1.312,1.043c-.808.486-1.899.025-1.333-.717,0,0,.563-.807,1.031-1.468Z" fill="url(#linear-gradient-192)"/>
      <Path d="M168.6,123.644c.367-.309.887-.351,1.301-.107l5.003,2.779c1.462.837.203,2.989-1.245,2.117l-5.123-3.168.994-.021s-1.292.762-1.877.852c-.726.111-1.341-.513-.789-.985,0,0,1.061-.9,1.735-1.466Z" fill="url(#linear-gradient-193)"/>
      <Path d="M168.218,126.009c.376-.333.914-.409,1.368-.194l3.729,1.762c.605.247.896.937.649,1.543-.26.652-1.052.932-1.665.592l-3.79-2.39.691.171s-.684.429-1.122.532c-.934.218-1.8-.389-1.04-.961,0,0,.652-.588,1.179-1.055Z" fill="url(#linear-gradient-194)"/>
      <Path d="M172.394,127.283c-.017,0-.035-.003-.052-.011l-3.096-1.422c-.063-.029-.09-.103-.062-.166.03-.063.104-.09.166-.061l3.096,1.422c.063.029.09.103.062.166-.021.046-.066.073-.114.073Z" fill="#23143d"/>
      <Path d="M129.872,165.567c.268.615-.034,1.771-1.852,3.187-1.792,1.396-3.459,1.808-3.896,1.272-.01-.02-.03-.04-.03-.06h-.01c-5.18-7.063-12.52-12.276-14.168-19.484-.985-4.308.568-7.252,3.864-9.475l14.46-9.584c3.772-2.502,6.034-2.276,9.141-2.455l.264.126.94,9.23-16.744,10.366s7.832,15.744,8.041,16.866l-.01.01Z" fill="url(#linear-gradient-195)"/>
      <Path d="M173.075,125.182c-.018,0-.036-.004-.052-.012l-3.083-1.423c-.469-.217-1.033-.146-1.435.18l-1.138.923c-.052.043-.132.036-.176-.019-.043-.054-.035-.132.019-.176l1.138-.923c.475-.386,1.141-.469,1.697-.212l3.084,1.423c.063.029.09.103.061.166-.021.046-.066.073-.113.073Z" fill="#23143d"/>
      <Path d="M173.292,124.274c-.02,0-.04-.005-.059-.015l-1.8-.961c-.06-.033-.083-.108-.051-.169.032-.061.108-.082.169-.051l1.8.961c.061.033.084.108.051.169-.023.042-.066.066-.11.066Z" fill="#23143d"/>
      <Path d="M171.984,118.822c.094.169.015.392-.176.498s-.422.055-.515-.114c-.093-.169-.015-.392.177-.497.191-.106.422-.055.515.114Z" fill="#23143d"/>
      <Path d="M171.736,119.848c.094.169.015.392-.176.497s-.422.055-.515-.114c-.094-.169-.015-.392.176-.497s.422-.055.515.114Z" fill="#23143d"/>
      <Path d="M169.542,128.684c-.037,0-.074-.017-.099-.048-.042-.055-.033-.133.022-.175l.365-.284-.684-.308c-.063-.028-.091-.102-.063-.165.028-.064.102-.092.165-.063l.873.393c.04.018.068.055.073.099.005.043-.013.086-.047.113l-.529.411c-.023.018-.05.026-.077.026Z" fill="#23143d"/>
      <Path d="M174.872,132.699c-.01.119.279,15.464-1.786,21.67-2.217,6.664-9.579,6.522-13.212,1.469-4.656-6.492-7.03-9.579-9.432-14.602,0,0-1.539-5.52.149-7.882,1.509-2.095,2.948-5.331,5.698-2.105,1.638,1.916,6.939,9.163,7.942,10.543,0,0,.099.149.288.357,1.608-4.318,3.891-8.835,3.891-8.835.02.169.179.308.457.417.536.218,1.519.298,2.631.169.099,0,.199-.02.308-.03,1.529-.199,2.78-.695,3.068-1.171Z" fill="url(#linear-gradient-196)"/>
      <Path d="M174.356,139.311v.102c0-.023,0-.034-.011-.057,0-.011.011-.034.011-.046Z" fill="url(#linear-gradient-197)"/>
      <Path d="M142.427,131.214c.262,2.081-.716,3.918-2.184,4.103-1.468.185-2.87-1.353-3.131-3.435s.716-3.918,2.184-4.103c1.468-.185,2.87,1.353,3.131,3.435Z" fill="url(#linear-gradient-198)"/>
      <Path d="M144.188,131.277c.387,2.062,1.88,3.512,3.333,3.239,1.454-.273,2.319-2.166,1.931-4.227-.387-2.062-1.879-3.512-3.333-3.239-1.454.273-2.319,2.166-1.931,4.227Z" fill="url(#linear-gradient-199)"/>
      <Path d="M148.823,136.918c-.318,2.214-.926,4.498-3.101,4.703-1.357.128-3.55-1.417-4.542-3.442-1.003-2.015-.824-4.14.407-4.745.874-.437,2.055.03,3.018,1.082.576-1.281,1.509-2.085,2.442-1.946,1.3.189,2.095,2.134,1.777,4.348Z" fill="url(#linear-gradient-200)"/>
      <Path d="M146.053,126.107l-.149,2.77v12.746l-6.145-12.746.139-3.077c0,.387,1.35.774,3.038.854,1.698.089,3.097-.159,3.117-.546Z" fill="url(#linear-gradient-201)"/>
      <Path d="M146.371,120.141l-.318,5.956v.01c-.02.387-1.419.635-3.117.546-1.688-.079-3.038-.467-3.038-.854v-.01l.337-7.793,6.135,2.144Z" fill="url(#linear-gradient-202)"/>
      <Path d="M141.573,122.156c.648,1.982,3.319,3.484,4.572,3.637l.125-3.125c-2.223-.518-5.202-2.058-4.697-.513Z" fill="#23143d"/>
      <Path d="M140.293,118.827c.041,2.972,2.985,5.869,5.926,5.114,1.994-.512,2.798-2.409,2.969-7.847.178-5.677-2.365-7.034-4.965-7.034s-4.035,2.077-3.93,9.767Z" fill="url(#linear-gradient-203)"/>
      <Path d="M149.089,113.789s-.286-2.69-2.525-3.12c-2.239-.431-4.945,1.094-5.44,3.592-.495,2.498-1.492,2.802-2.224,2.5-.732-.301-.194-6.243-.065-6.243s2.728-1.876,2.728-1.876l4.523.418,1.61.995s1.392,1.577,1.392,3.734Z" fill="url(#linear-gradient-204)"/>
      <Ellipse cx="139.682" cy="116.387" rx="1.323" ry="1.635" transform="translate(-41.386 132.859) rotate(-45)" fill="url(#linear-gradient-205)"/>
      <Path d="M145.901,116.922c-.054,0-.104-.035-.12-.089-.02-.066.018-.136.084-.155l.597-.178c.091-.027.165-.093.205-.18.039-.087.038-.186-.003-.272l-.609-1.287c-.03-.062-.003-.137.06-.166.062-.029.137-.002.166.06l.609,1.287c.072.152.074.327.005.481-.068.154-.2.269-.361.317l-.597.178c-.012.004-.024.005-.036.005Z" fill="#23143d"/>
      <Path d="M144.144,116.935c.278,1.413,1.712.909,2.104.326,0,0-.665.027-1.318-.08-.454-.074-.786-.246-.786-.246Z" fill="#fff"/>
      <Path d="M144.956,113.642c-.475-.019-.961.02-1.378.282-.067.041-.154.021-.195-.046.025-.693,1.109-.841,1.655-.712.129.032.208.162.177.291-.029.12-.141.193-.258.184h0Z" fill="#3a255e"/>
      <Path d="M147.133,113.174c.583-.08,1.248.069,1.616.555.043.062.028.148-.035.191-.142.078-.569-.197-.827-.199-.238-.065-.502-.059-.739-.089-.258-.023-.267-.419-.015-.457h0Z" fill="#3a255e"/>
      <Path d="M144.023,115.123c-.011.265.156.487.372.495.216.009.4-.199.41-.464.011-.265-.156-.487-.372-.495-.216-.009-.399.199-.41.464Z" fill="#23143d"/>
      <Path d="M147.823,115.187c-.011.265.156.487.372.495.216.009.4-.199.41-.464s-.156-.487-.372-.495c-.216-.009-.4.199-.41.464Z" fill="#23143d"/>
      <Path d="M138.988,116.512c-.051,0-.099-.031-.117-.082-.06-.162-.042-.323.05-.455.105-.151.294-.241.504-.241.409,0,.95.447,1.011.497.053.044.06.124.015.176-.044.053-.123.06-.176.015-.145-.122-.58-.439-.85-.439-.127,0-.242.051-.299.134-.044.063-.051.141-.021.225.024.065-.009.137-.074.161-.015.005-.029.008-.043.008Z" fill="#23143d"/>
      <Path d="M154.654,147.856c-.013,0-.026-.002-.039-.006-.066-.021-.101-.092-.08-.157.016-.049,1.564-4.89.425-8.239-.912-2.678-1.306-4.849-1.31-4.87-.012-.068.033-.133.101-.145.064-.017.133.033.145.101.004.021.396,2.174,1.3,4.834,1.167,3.428-.408,8.347-.424,8.397-.017.053-.066.086-.119.086Z" fill="#23143d"/>
      <Path d="M146.821,157.042c-.066,0-.121-.051-.125-.117l-.919-15.297c-.004-.069.049-.128.118-.132.071-.001.128.048.132.118l.919,15.296c.004.069-.049.129-.118.133h-.007Z" fill="#23143d"/>
      <Path d="M162.848,152.657c-.063,0-.117-.047-.124-.11-.616-5.324,1.653-10.398,1.676-10.449.029-.063.102-.091.166-.062.063.028.091.103.062.166-.022.05-2.263,5.063-1.655,10.316.008.069-.041.131-.11.139-.005,0-.009,0-.014,0Z" fill="#23143d"/>
      <Path d="M121.84,148.821c-.047,0-.093-.027-.114-.073-1.801-3.95-4.235-4.421-4.26-4.425-.068-.012-.113-.077-.102-.145.012-.067.077-.118.144-.102.105.017,2.585.487,4.445,4.568.029.063.001.137-.062.166-.017.008-.034.011-.052.011Z" fill="#23143d"/>
      <Path d="M131.729,142.857c-.06,0-.112-.042-.123-.102-.235-1.285-1.752-4.715-1.767-4.749-.028-.064,0-.137.063-.165.064-.028.137,0,.165.064.063.142,1.544,3.492,1.785,4.806.012.068-.033.133-.101.145-.007.001-.015.002-.023.002Z" fill="#23143d"/>
      <Path d="M171.834,269.835c.588,1.447-2.717,4.158-7.383,6.055-4.666,1.897-8.925,2.261-9.514.814-.588-1.447,2.717-4.158,7.383-6.055,4.666-1.897,8.925-2.262,9.514-.814Z" fill="url(#linear-gradient-206)"/>
      <Path d="M146.279,274.766c.037.93-4.533,1.865-10.206,2.09-5.674.224-10.303-.348-10.34-1.278-.037-.93,4.533-1.865,10.206-2.09,5.674-.224,10.303.348,10.34,1.278Z" fill="url(#linear-gradient-207)"/>
      </G>
      <G>
      <Path d="M237.824,273.278c2.194,5.396,7.883,8.181,12.707,6.22,4.824-1.961,6.957-7.926,4.763-13.322-2.194-5.396-7.883-8.181-12.707-6.22-4.824,1.961-6.957,7.926-4.763,13.322Z" fill="url(#linear-gradient-208)"/>
      <Ellipse cx="326.059" cy="269.726" rx="9.429" ry="10.548" transform="translate(-77.572 142.648) rotate(-22.123)" fill="url(#linear-gradient-209)"/>
      <Path d="M330.073,240.148h-4.46c-.945,0-1.711-.766-1.711-1.711h0c0-2.339,1.896-4.236,4.235-4.236h1.935c1.363,0,2.468,1.105,2.468,2.468v1.01c0,1.363-1.105,2.468-2.468,2.468Z" fill="url(#linear-gradient-210)"/>
      <Path d="M239.199,206.76s7.725,12.886,8.293,12.886c.403,0,8.32-1.19,12.886-1.881,1.881-.289,3.193-.49,3.193-.49l2.607-5.835c.595.245,1.19.499,1.776.752.49.21.971.429,1.452.656.07.035.14.07.201.096.499.236.989.472,1.487.726.446.227.892.455,1.33.691.621.333,1.234.674,1.837,1.024.507.297,1.015.595,1.522.91h.009q.009.009.017.017c.472.289.945.586,1.408.892.096.061.201.131.297.201.42.271.831.551,1.242.831.079.052.157.114.236.166.464.324.919.647,1.365.98.026.026.061.044.088.07.438.324.866.656,1.295.989.472.367.945.744,1.408,1.137.472.385.927.779,1.382,1.181.91.796,1.802,1.627,2.677,2.485.403.394.805.805,1.199,1.216.122.114.236.236.341.359.341.35.674.709.997,1.067l3.736,4.339c2.126,2.467,4.532,4.672,7.165,6.552h27.574c-2.633-1.881-5.039-4.086-7.165-6.552l-3.735-4.339c-.219-.245-.446-.49-.674-.726-6.097-6.526-13.42-11.644-21.468-15.108-2.52-1.102-5.109-2.03-7.76-2.791-.656-.192-1.321-.368-1.986-.534-.98-.245-1.968-.472-2.966-.674-4.182-.857-8.477-1.295-12.816-1.295h-30.453Z" fill="url(#linear-gradient-211)"/>
      <Path d="M220.277,260.527l1.076,7.987h126.526c0-4.899-1.137-9.632-3.228-13.883-.332-.656-.682-1.303-1.05-1.942-.735-1.251-1.548-2.449-2.441-3.587-2.484-3.176-5.608-5.888-9.229-7.943-1.286-.726-2.519-1.522-3.709-2.379h-105.933c-2.283,6.885-3.018,14.321-2.012,21.748Z" fill="url(#linear-gradient-212)"/>
      <Path d="M194.715,238.779h105.933c-2.633-1.881-5.039-4.086-7.165-6.552l-3.736-4.339c-.324-.359-.656-.717-.997-1.067-.542-.577-1.093-1.137-1.653-1.689-.402-.385-.805-.77-1.216-1.155-.437-.411-.892-.822-1.347-1.216-.91-.805-1.837-1.575-2.791-2.318-.429-.332-.857-.665-1.295-.989-.026-.026-.061-.044-.088-.07-.455-.332-.901-.656-1.365-.98-.122-.087-.254-.175-.385-.262-.359-.254-.726-.499-1.094-.735-.096-.07-.201-.14-.297-.201-.464-.306-.936-.604-1.408-.892q-.009-.009-.017-.017h-.009c-.254-.157-.507-.315-.761-.464-.324-.192-.647-.376-.971-.569-.49-.28-.98-.551-1.487-.822-2.073-1.111-4.208-2.117-6.386-3.001-1.006-.402-2.021-.779-3.044-1.137-2.528-.875-5.118-1.592-7.751-2.152-4.339-.918-8.792-1.391-13.297-1.391h-2.887c-2.537,0-5.039.201-7.471.586-.77.122-1.54.262-2.292.429-1.837.376-3.639.875-5.389,1.478-4.05,1.356-7.856,3.254-11.329,5.599-8.652,5.835-14.828,14.338-18.004,23.927Z" fill="url(#linear-gradient-213)"/>
      <Path d="M198.24,238.779h98.882c-2.458-1.758-4.698-3.814-6.684-6.115l-2.502-2.896-.988-1.155c-2.275-2.511-4.733-4.803-7.357-6.859-.481-.385-.971-.761-1.461-1.12-1.059-.787-2.143-1.531-3.254-2.24-3.954-2.537-8.188-4.593-12.615-6.141-2.406-.84-4.882-1.531-7.392-2.064-4.05-.857-8.206-1.304-12.405-1.304h-2.694c-3.254,0-6.43.35-9.483,1.032-.735.149-1.461.332-2.187.534-2.301.621-4.523,1.426-6.657,2.414-2.24,1.006-4.374,2.213-6.395,3.578-8.075,5.45-13.84,13.385-16.805,22.334Z" fill="#9c79d8"/>
      <Path d="M192.265,253.852c-.009,2.213.131,4.444.438,6.675l1.076,7.987h126.526c0-5.66-1.522-11.102-4.278-15.826-1.4-2.406-3.123-4.628-5.127-6.596-1.933-1.898-4.12-3.561-6.544-4.934-1.286-.726-2.519-1.522-3.709-2.379h-105.933c-1.338,4.05-2.152,8.302-2.38,12.624-.026.534-.053,1.058-.061,1.592-.009.289-.009.569-.009.857Z" fill="url(#linear-gradient-214)"/>
      <Path d="M284.673,268.516h19.217c-1.23-4.628-5.063-8.014-9.614-8.014s-8.373,3.386-9.603,8.014Z" fill="#853f21"/>
      <Path d="M202.757,269.62l23.92-.112c-.559-9.512-6.603-13.38-12.169-13.38s-11.993,3.689-11.751,13.493Z" fill="url(#linear-gradient-215)"/>
      <Path d="M206.057,273.278c2.194,5.396,7.883,8.181,12.707,6.22,4.824-1.961,6.957-7.926,4.763-13.322-2.194-5.396-7.883-8.181-12.707-6.22-4.824,1.961-6.957,7.926-4.763,13.322Z" fill="url(#linear-gradient-216)"/>
      <Path d="M303.932,269.62h30.513c1.073,0,1.943-.87,1.943-1.943h0c0-1.073-.87-1.943-1.943-1.943h-30.513c-1.073,0-1.943.87-1.943,1.943h0c0,1.073.87,1.943,1.943,1.943Z" fill="url(#linear-gradient-217)"/>
      <Path d="M316.902,269.62h34.4c0-2.147-1.74-3.887-3.887-3.887h-26.627c-2.146,0-3.887,1.74-3.887,3.887h0Z" fill="url(#linear-gradient-218)"/>
      <Path d="M226.677,269.507h55.35c1.011,0,1.831-.82,1.831-1.831h0c0-1.011-.82-1.831-1.831-1.831h-55.35c-1.011,0-1.831.82-1.831,1.831h0c0,1.011.82,1.831,1.831,1.831Z" fill="url(#linear-gradient-219)"/>
      <Path d="M192.11,265.733h13.959v.522c0,1.857-1.508,3.364-3.364,3.364h-10.594c-.928,0-1.682-.754-1.682-1.682v-.522c0-.928.754-1.682,1.682-1.682Z" transform="translate(396.497 535.353) rotate(-180)" fill="url(#linear-gradient-220)"/>
      <Path d="M209.908,271.712c1.227,3.017,4.408,4.574,7.105,3.477,2.697-1.096,3.89-4.431,2.663-7.448-1.227-3.017-4.408-4.574-7.105-3.478-2.697,1.096-3.889,4.431-2.663,7.449Z" fill="#23143d"/>
      <Path d="M211.405,271.103c.851,2.092,3.057,3.172,4.927,2.412,1.871-.76,2.697-3.073,1.847-5.166-.851-2.093-3.057-3.172-4.927-2.412s-2.697,3.073-1.847,5.166Z" fill="#fff"/>
      <Path d="M285.557,273.278c2.194,5.396,7.883,8.181,12.707,6.22,4.824-1.961,6.956-7.926,4.763-13.322-2.194-5.396-7.883-8.181-12.707-6.22-4.824,1.961-6.956,7.926-4.763,13.322Z" fill="url(#linear-gradient-221)"/>
      <Path d="M289.408,271.712c1.227,3.017,4.407,4.574,7.105,3.477,2.697-1.096,3.889-4.431,2.663-7.448-1.227-3.017-4.407-4.574-7.105-3.478-2.697,1.096-3.889,4.431-2.663,7.449Z" fill="#23143d"/>
      <Path d="M290.905,271.103c.851,2.092,3.057,3.172,4.927,2.412,1.871-.76,2.697-3.073,1.847-5.166-.851-2.093-3.057-3.172-4.927-2.412s-2.697,3.073-1.847,5.166Z" fill="#fff"/>
      <Ellipse cx="314.309" cy="251.752" rx="6.465" ry="3.779" fill="#fff"/>
      <Path d="M340.233,251.053c0,1.662,1.855,3.079,4.418,3.578-.332-.656-.682-1.303-1.05-1.942-.735-1.251-1.548-2.449-2.441-3.587-.586.577-.927,1.242-.927,1.951Z" fill="#fff"/>
      <Path d="M322.368,254.553h16.273c-1.249-3.367-4.462-5.602-8.053-5.602h-2.618c-3.094,0-5.602,2.508-5.602,5.602h0Z" fill="url(#linear-gradient-222)"/>
      <Path d="M347.73,265.81h-27.88c-.193,0-.35-.156-.35-.35s.157-.35.35-.35h27.88c.193,0,.35.156.35.35s-.157.35-.35.35Z" fill="#fff"/>
      <Path d="M249.943,265.81c-.166,0-.313-.118-.344-.288l-10.18-56.569c-.034-.189.092-.371.282-.405.19-.037.371.091.406.282l10.18,56.569c.034.19-.092.371-.282.405-.021.004-.042.006-.063.006Z" fill="#fff"/>
      <Path d="M320.156,265.81h-15.201c-.188,0-.343-.149-.35-.338-.17-5.259-4.425-9.378-9.687-9.378h-1.354c-5.165,0-9.366,4.202-9.366,9.366,0,.193-.157.35-.35.35h-58.492c-.193,0-.35-.156-.35-.35s.157-.35.35-.35h58.149c.185-5.389,4.626-9.716,10.06-9.716h1.354c5.527,0,10.019,4.24,10.369,9.716h14.868c.193,0,.35.156.35.35s-.157.35-.35.35Z" fill="#fff"/>
      <Path d="M225.408,265.81c-.146,0-.282-.092-.331-.237l-.979-2.893c-1.335-3.94-5.026-6.586-9.185-6.586h-18.527c-.175,0-.323-.13-.347-.303-.01-.079-1.025-7.987,1.867-17.117.058-.185.252-.29.439-.228.184.058.286.255.228.439-2.526,7.974-2.024,14.99-1.874,16.51h18.214c4.459,0,8.416,2.838,9.847,7.061l.98,2.893c.062.183-.036.382-.219.443-.037.013-.075.019-.112.019Z" fill="#fff"/>
      <Path d="M249.481,248.926h4.736c.272,0,.493-.221.493-.493h0c0-.272-.221-.493-.493-.493h-4.736c-.272,0-.493.221-.493.493h0c0,.272.221.493.493.493Z" fill="#23143d"/>
      <Path d="M200.154,248.926h4.736c.272,0,.493-.221.493-.493h0c0-.272-.221-.493-.493-.493h-4.736c-.272,0-.493.221-.493.493h0c0,.272.221.493.493.493Z" fill="#23143d"/>
      <Rect x="194.887" y="258.488" width="6.706" height="5.032" rx="1.262" ry="1.262" transform="translate(396.48 522.009) rotate(180)" fill="url(#linear-gradient-223)"/>
      <Path d="M298.535,252.198c0,.44.946.797,2.112.797s2.112-.357,2.112-.797-.946-.797-2.112-.797-2.112.357-2.112.797Z" fill="url(#linear-gradient-224)"/>
      <Path d="M192.274,252.995c1.164,0,2.1-.359,2.1-.796,0-.429-.91-.779-2.038-.796-.026.534-.053,1.058-.061,1.592Z" fill="url(#linear-gradient-225)"/>
      <Circle cx="198.355" cy="261.004" r="1.539" fill="#23143d"/>
      <G>
      <Path d="M263.135,210.303c1.024.359,2.038.735,3.044,1.137,2.178.883,4.313,1.89,6.386,3.001.507.271.997.542,1.487.822.324.192.647.376.971.569.254.149.507.306.761.464h.009c1.723-3.499,4.059-6.185,6.675-8.241-4.182-.857-8.477-1.295-12.816-1.295h-4.558c-.709,1.12-1.356,2.301-1.96,3.543Z" fill="url(#linear-gradient-226)"/>
      <Path d="M262.26,212.254c4.427,1.549,8.661,3.604,12.615,6.141.28-.735.577-1.426.91-2.1-.254-.157-.507-.315-.761-.464-.324-.192-.647-.376-.971-.569-.49-.28-.98-.551-1.487-.822-2.073-1.111-4.208-2.117-6.386-3.001-1.006-.402-2.021-.779-3.044-1.137-.306.63-.604,1.286-.875,1.951Z" fill="url(#linear-gradient-227)"/>
      <Path d="M255.13,238.779h14.356c1.408-6.168,3.036-12.746,4.654-18.231.219-.752.464-1.461.735-2.152-3.954-2.537-8.188-4.593-12.615-6.141-.577,1.374-1.093,2.817-1.54,4.33-.114.385-.227.779-.341,1.181-1.89,6.552-3.735,14.225-5.249,21.013Z" fill="url(#linear-gradient-228)"/>
      </G>
      <G>
      <Path d="M288.75,226.82c.341.35.674.709.997,1.067l3.736,4.339c2.126,2.467,4.532,4.672,7.165,6.552h12.064c.612-2.38,1.242-4.672,1.872-6.798.429-1.461,1.041-3.132,2.065-4.82-6.097-6.526-13.42-11.644-21.468-15.108-2.388,3.578-4.365,7.716-5.774,12.493-.219.744-.437,1.505-.656,2.275Z" fill="url(#linear-gradient-229)"/>
      <Path d="M287.936,229.768l2.502,2.896c1.986,2.301,4.225,4.357,6.684,6.115h3.526c-2.633-1.881-5.039-4.086-7.165-6.552l-3.736-4.339c-.324-.359-.656-.717-.997-1.067-.271.962-.542,1.951-.814,2.948Z" fill="url(#linear-gradient-230)"/>
      <Path d="M285.653,238.779h11.469c-2.458-1.758-4.698-3.814-6.684-6.115l-2.502-2.896c-.787,2.922-1.548,5.975-2.283,9.011Z" fill="url(#linear-gradient-231)"/>
      </G>
      <Path d="M287.141,240.148h4.46c.945,0,1.711-.766,1.711-1.711h0c0-2.339-1.896-4.236-4.235-4.236h-1.936c-1.363,0-2.468,1.105-2.468,2.468v1.01c0,1.363,1.105,2.468,2.468,2.468Z" fill="url(#linear-gradient-232)"/>
      <G>
      <Path d="M228.098,210.452c.726-.201,1.452-.385,2.187-.534.446-.901.936-1.758,1.444-2.572-.77.122-1.54.262-2.292.429-.481.849-.927,1.741-1.338,2.677Z" fill="url(#linear-gradient-233)"/>
      <Path d="M220.531,238.779h1.785c1.662-7.506,3.753-16.333,5.844-23.428.586-1.968,1.303-3.779,2.126-5.433-.735.149-1.461.332-2.187.534-.612,1.373-1.155,2.834-1.618,4.4-2.143,7.261-4.278,16.316-5.949,23.927Z" fill="url(#linear-gradient-234)"/>
      </G>
      <G>
      <Path d="M278.995,218.404c.464.324.91.647,1.365.98.026.026.061.044.088.07,1.75-4.217,4.182-7.558,6.972-10.192-.656-.192-1.321-.368-1.986-.534-2.537,2.581-4.768,5.765-6.439,9.676Z" fill="url(#linear-gradient-235)"/>
      <Path d="M278.129,220.635c.49.359.98.735,1.461,1.12.263-.796.551-1.566.857-2.301-.026-.026-.061-.044-.088-.07-.455-.332-.901-.656-1.365-.98-.306.717-.595,1.461-.866,2.231Z" fill="url(#linear-gradient-236)"/>
      <Path d="M273.318,238.779h1.793c1.286-5.468,2.703-11.093,4.129-15.913.114-.376.227-.744.35-1.111-.481-.385-.971-.761-1.461-1.12-.201.56-.385,1.137-.56,1.732-1.47,4.969-2.931,10.795-4.252,16.412Z" fill="url(#linear-gradient-237)"/>
      </G>
      <G>
      <Path d="M194.715,238.779h3.526c2.966-8.95,8.731-16.884,16.805-22.334,2.021-1.365,4.155-2.572,6.395-3.578.77-1.347,1.645-2.546,2.607-3.613-4.05,1.356-7.856,3.254-11.329,5.599-8.652,5.835-14.828,14.338-18.004,23.927Z" fill="url(#linear-gradient-238)"/>
      <Path d="M198.24,238.779h15.826c1.548-6.902,3.412-14.653,5.275-20.952.542-1.846,1.251-3.491,2.1-4.96-2.24,1.006-4.374,2.213-6.395,3.578-8.075,5.45-13.84,13.385-16.805,22.334Z" fill="url(#linear-gradient-239)"/>
      </G>
      <Path d="M204.22,265.81h-10.853c-.193,0-.35-.156-.35-.35s.157-.35.35-.35h10.853c.193,0,.35.156.35.35s-.157.35-.35.35Z" fill="#fff"/>
      </G>
      <G>
      <Path d="M315.595,93.102h-82.331c-2.069,0-3.551-1.677-3.311-3.745l2.739-23.622c.24-2.069,2.111-3.745,4.18-3.745h82.331c2.069,0,3.551,1.677,3.311,3.745l-2.739,23.622c-.24,2.068-2.111,3.745-4.18,3.745Z" fill="url(#linear-gradient-240)"/>
      <G>
      <Path d="M257.365,77.739c-.343,2.956-1.948,5.608-4.209,7.419-1.924,1.538-4.322,2.466-6.821,2.466s-4.682-.927-6.249-2.466c-1.84-1.822-2.831-4.473-2.489-7.419.634-5.466,5.577-9.895,11.032-9.895s9.371,4.429,8.737,9.895Z" fill="url(#linear-gradient-241)"/>
      <G>
      <Path d="M250.355,76.312c-.173,1.494-1.525,2.706-3.02,2.706s-2.566-1.211-2.392-2.706c.173-1.494,1.525-2.706,3.02-2.706s2.565,1.212,2.392,2.706Z" fill="#fff"/>
      <Path d="M253.155,85.158c-1.924,1.538-4.322,2.466-6.821,2.466s-4.682-.927-6.249-2.466c1.241-2.706,4.053-4.659,7.075-4.659s5.381,1.953,5.995,4.659Z" fill="#fff"/>
      </G>
      </G>
      <Path d="M297.659,76.026h-31.315c-.852,0-1.463-.691-1.364-1.543h0c.099-.852.87-1.543,1.722-1.543h31.315c.852,0,1.463.691,1.364,1.543h0c-.099.852-.87,1.543-1.722,1.543Z" fill="url(#linear-gradient-242)"/>
      <Path d="M305.981,70.929h-39.046c-.852,0-1.463-.691-1.364-1.543h0c.099-.852.87-1.543,1.722-1.543h39.046c.852,0,1.463.691,1.364,1.543h0c-.099.852-.87,1.543-1.722,1.543Z" fill="url(#linear-gradient-243)"/>
      <G>
      <Path d="M268.485,80.217l.542,1.435c.062.163.204.276.381.302l1.557.23c.445.066.561.622.197.941l-1.275,1.117c-.145.127-.225.309-.215.488l.088,1.577c.025.451-.488.795-.868.582l-1.33-.744c-.151-.084-.343-.084-.514,0l-1.502.744c-.43.213-.863-.131-.733-.582l.453-1.577c.052-.179.013-.362-.102-.488l-1.016-1.117c-.291-.319-.045-.876.415-.941l1.61-.23c.183-.026.351-.139.45-.302l.874-1.435c.25-.41.835-.41.99,0Z" fill="url(#linear-gradient-244)"/>
      <Path d="M278.327,80.217l.542,1.435c.062.163.204.276.381.302l1.557.23c.445.066.561.622.197.941l-1.275,1.117c-.145.127-.225.309-.215.488l.088,1.577c.025.451-.488.795-.868.582l-1.33-.744c-.151-.084-.343-.084-.514,0l-1.502.744c-.43.213-.863-.131-.733-.582l.453-1.577c.052-.179.013-.362-.102-.488l-1.016-1.117c-.29-.319-.045-.876.415-.941l1.61-.23c.183-.026.351-.139.45-.302l.874-1.435c.25-.41.835-.41.99,0Z" fill="url(#linear-gradient-245)"/>
      <Path d="M288.168,80.217l.542,1.435c.061.163.204.276.38.302l1.557.23c.445.066.561.622.197.941l-1.275,1.117c-.145.127-.225.309-.215.488l.088,1.577c.025.451-.488.795-.868.582l-1.33-.744c-.151-.084-.343-.084-.514,0l-1.503.744c-.429.213-.863-.131-.733-.582l.453-1.577c.052-.179.013-.362-.102-.488l-1.016-1.117c-.291-.319-.045-.876.415-.941l1.61-.23c.183-.026.351-.139.45-.302l.874-1.435c.25-.41.835-.41.99,0Z" fill="url(#linear-gradient-246)"/>
      <Path d="M298.01,80.217l.542,1.435c.061.163.204.276.38.302l1.557.23c.445.066.561.622.197.941l-1.275,1.117c-.145.127-.225.309-.215.488l.088,1.577c.025.451-.488.795-.868.582l-1.33-.744c-.151-.084-.343-.084-.514,0l-1.503.744c-.429.213-.863-.131-.733-.582l.453-1.577c.051-.179.013-.362-.102-.488l-1.016-1.117c-.29-.319-.045-.876.415-.941l1.61-.23c.183-.026.351-.139.45-.302l.874-1.435c.25-.41.835-.41.99,0Z" fill="url(#linear-gradient-247)"/>
      <Path d="M307.852,80.217l.542,1.435c.061.163.204.276.38.302l1.557.23c.445.066.561.622.197.941l-1.275,1.117c-.145.127-.225.309-.215.488l.088,1.577c.025.451-.488.795-.868.582l-1.33-.744c-.151-.084-.343-.084-.514,0l-1.503.744c-.429.213-.863-.131-.733-.582l.453-1.577c.051-.179.013-.362-.102-.488l-1.016-1.117c-.291-.319-.045-.876.415-.941l1.61-.23c.183-.026.351-.139.45-.302l.874-1.435c.25-.41.835-.41.99,0Z" fill="url(#linear-gradient-248)"/>
      </G>
      </G>
      <G>
      <Path d="M307.134,139.385h-82.331c-2.068,0-3.551-1.677-3.311-3.745l2.739-23.622c.24-2.069,2.111-3.745,4.18-3.745h82.331c2.068,0,3.551,1.677,3.311,3.745l-2.739,23.622c-.24,2.069-2.111,3.745-4.18,3.745Z" fill="url(#linear-gradient-249)"/>
      <G>
      <Path d="M248.904,124.021c-.343,2.957-1.948,5.608-4.209,7.419-1.924,1.538-4.322,2.466-6.821,2.466s-4.682-.927-6.249-2.466c-1.84-1.822-2.831-4.473-2.489-7.419.634-5.466,5.577-9.895,11.031-9.895s9.371,4.429,8.737,9.895Z" fill="url(#linear-gradient-250)"/>
      <G>
      <Path d="M241.894,122.595c-.173,1.494-1.525,2.706-3.02,2.706s-2.565-1.212-2.392-2.706c.173-1.494,1.525-2.706,3.02-2.706s2.565,1.212,2.392,2.706Z" fill="#fff"/>
      <Path d="M244.695,131.44c-1.924,1.538-4.322,2.466-6.821,2.466s-4.682-.927-6.249-2.466c1.241-2.706,4.053-4.658,7.075-4.658s5.381,1.953,5.995,4.658Z" fill="#fff"/>
      </G>
      </G>
      <Path d="M271.164,122.308h-13.28c-.852,0-1.463-.691-1.364-1.543h0c.099-.852.87-1.543,1.722-1.543h13.28c.852,0,1.463.691,1.364,1.543h0c-.099.852-.87,1.543-1.722,1.543Z" fill="url(#linear-gradient-251)"/>
      <Path d="M297.521,117.212h-39.046c-.852,0-1.463-.691-1.364-1.543h0c.099-.852.87-1.543,1.722-1.543h39.046c.852,0,1.463.691,1.364,1.543h0c-.099.852-.87,1.543-1.722,1.543Z" fill="url(#linear-gradient-252)"/>
      <G>
      <Path d="M260.024,126.5l.542,1.435c.062.163.204.276.381.302l1.557.23c.445.066.561.622.197.941l-1.275,1.117c-.145.127-.225.309-.215.488l.088,1.577c.025.451-.488.794-.868.582l-1.33-.744c-.151-.085-.343-.085-.514,0l-1.502.744c-.43.213-.863-.131-.733-.582l.453-1.577c.051-.179.013-.362-.102-.488l-1.016-1.117c-.291-.319-.045-.875.415-.941l1.61-.23c.183-.026.351-.139.45-.302l.874-1.435c.25-.41.835-.41.99,0Z" fill="url(#linear-gradient-253)"/>
      <Path d="M269.866,126.5l.542,1.435c.062.163.204.276.381.302l1.557.23c.445.066.561.622.197.941l-1.275,1.117c-.145.127-.225.309-.215.488l.088,1.577c.025.451-.488.794-.868.582l-1.33-.744c-.151-.085-.343-.085-.514,0l-1.502.744c-.43.213-.863-.131-.733-.582l.453-1.577c.051-.179.013-.362-.102-.488l-1.016-1.117c-.291-.319-.045-.875.415-.941l1.61-.23c.183-.026.351-.139.45-.302l.874-1.435c.25-.41.835-.41.99,0Z" fill="url(#linear-gradient-254)"/>
      <Path d="M279.708,126.5l.542,1.435c.061.163.204.276.38.302l1.557.23c.445.066.561.622.197.941l-1.275,1.117c-.145.127-.225.309-.215.488l.088,1.577c.025.451-.488.794-.868.582l-1.33-.744c-.151-.085-.343-.085-.514,0l-1.502.744c-.43.213-.863-.131-.733-.582l.453-1.577c.051-.179.013-.362-.102-.488l-1.016-1.117c-.291-.319-.045-.875.415-.941l1.61-.23c.183-.026.351-.139.45-.302l.874-1.435c.25-.41.835-.41.99,0Z" fill="url(#linear-gradient-255)"/>
      <Path d="M290.205,133.487c-.129,0-.257-.032-.373-.097l-1.33-.745c-.078-.043-.184-.043-.281.006l-1.502.745c-.293.146-.621.115-.856-.081-.227-.19-.314-.493-.227-.794l.453-1.577c.027-.095.01-.189-.046-.251l-1.017-1.117c-.189-.208-.241-.499-.141-.778.112-.311.382-.533.705-.58l1.611-.23c.107-.016.212-.087.272-.185l.874-1.435c.175-.288.49-.456.819-.424.287.027.518.201.618.466l.542,1.435c.029.078.096.13.184.143l1.556.23c.291.043.513.234.595.512.089.303-.017.642-.27.864l-1.276,1.117c-.086.075-.136.185-.13.287l.087,1.577c.018.308-.143.605-.417.777-.142.089-.297.134-.45.134ZM289.092,126.442c-.1,0-.234.048-.319.188l-.874,1.435c-.137.225-.372.382-.628.419l-1.611.23c-.167.024-.268.151-.305.253-.018.049-.049.174.04.272l1.016,1.117c.174.191.233.462.157.726l-.453,1.577c-.032.11-.007.209.067.271.082.067.199.075.314.017l1.503-.745c.245-.122.524-.119.747.006l1.33.745c.09.05.207.042.313-.024.094-.059.191-.175.183-.325l-.087-1.578c-.014-.255.098-.513.3-.69l1.275-1.117c.13-.114.147-.254.12-.347-.015-.051-.06-.14-.188-.159l-1.557-.229c-.268-.04-.484-.212-.578-.461l-.541-1.435c-.041-.108-.129-.138-.197-.145-.009-.001-.018-.002-.027-.002Z" fill="url(#linear-gradient-256)"/>
      <Path d="M300.046,133.487c-.129,0-.257-.032-.373-.097l-1.33-.745c-.08-.044-.184-.043-.281.006l-1.502.745c-.294.146-.622.114-.856-.081-.227-.189-.314-.493-.228-.793l.454-1.578c.027-.095.01-.189-.046-.251l-1.017-1.117c-.188-.208-.241-.499-.14-.778.112-.311.382-.533.705-.579l1.611-.23c.107-.016.212-.087.272-.185l.875-1.435c.175-.288.495-.456.819-.424.287.027.518.201.618.466l.542,1.435c.029.078.096.13.184.143l1.556.23c.291.043.513.234.595.512.089.303-.017.643-.271.864l-1.275,1.117c-.086.076-.136.185-.13.286l.087,1.578c.018.308-.142.605-.417.777-.143.089-.298.134-.451.134ZM298.934,126.442c-.1,0-.234.048-.319.188l-.875,1.435c-.137.225-.372.382-.628.419l-1.611.23c-.166.024-.268.151-.305.253-.018.049-.049.174.04.272l1.017,1.116c.174.191.233.462.157.726l-.454,1.578c-.032.11-.007.208.068.271.081.067.199.075.314.017l1.502-.745c.245-.121.524-.119.747.006l1.33.745c.092.052.208.043.314-.024.094-.059.191-.174.183-.325l-.087-1.578c-.015-.255.098-.514.3-.69l1.275-1.116c.13-.114.147-.254.12-.347-.015-.051-.06-.14-.188-.159l-1.557-.229c-.268-.04-.484-.212-.578-.461l-.542-1.435c-.041-.108-.129-.138-.197-.145-.009-.001-.018-.002-.027-.002Z" fill="url(#linear-gradient-257)"/>
      </G>
      </G>
      <G>
      <Path d="M301.848,184.978h-82.331c-2.069,0-3.551-1.677-3.311-3.746l2.739-23.622c.24-2.069,2.111-3.745,4.18-3.745h82.331c2.069,0,3.551,1.677,3.311,3.745l-2.739,23.622c-.24,2.069-2.111,3.746-4.18,3.746Z" fill="url(#linear-gradient-258)"/>
      <G>
      <Path d="M243.618,169.615c-.343,2.957-1.948,5.608-4.209,7.419-1.924,1.538-4.322,2.466-6.821,2.466s-4.682-.927-6.249-2.466c-1.84-1.822-2.831-4.473-2.489-7.419.634-5.466,5.577-9.895,11.032-9.895s9.371,4.429,8.737,9.895Z" fill="url(#linear-gradient-259)"/>
      <G>
      <Path d="M236.608,168.189c-.173,1.495-1.525,2.706-3.02,2.706s-2.565-1.211-2.392-2.706c.173-1.494,1.525-2.706,3.02-2.706s2.566,1.211,2.392,2.706Z" fill="#fff"/>
      <Path d="M239.408,177.034c-1.924,1.538-4.322,2.466-6.821,2.466s-4.682-.927-6.249-2.466c1.241-2.706,4.053-4.658,7.075-4.658s5.381,1.953,5.995,4.658Z" fill="#fff"/>
      </G>
      </G>
      <Path d="M288.878,167.902h-36.281c-.852,0-1.463-.691-1.364-1.543h0c.099-.852.87-1.543,1.722-1.543h36.281c.852,0,1.463.691,1.364,1.543h0c-.099.852-.87,1.543-1.722,1.543Z" fill="url(#linear-gradient-260)"/>
      <Path d="M262.985,162.806h-9.797c-.852,0-1.463-.691-1.364-1.543h0c.099-.852.87-1.543,1.722-1.543h9.797c.852,0,1.463.691,1.364,1.543h0c-.099.852-.87,1.543-1.722,1.543Z" fill="url(#linear-gradient-261)"/>
      <G>
      <Path d="M254.738,172.093l.542,1.435c.061.163.204.276.38.302l1.557.23c.445.066.561.622.197.941l-1.275,1.117c-.145.127-.225.309-.215.488l.088,1.577c.025.451-.488.794-.868.582l-1.33-.745c-.151-.085-.343-.085-.514,0l-1.503.745c-.43.213-.863-.131-.733-.582l.453-1.577c.051-.179.013-.362-.102-.488l-1.016-1.117c-.291-.319-.045-.875.415-.941l1.61-.23c.183-.026.351-.139.45-.302l.874-1.435c.25-.41.835-.41.99,0Z" fill="url(#linear-gradient-262)"/>
      <Path d="M264.58,172.093l.542,1.435c.061.163.204.276.381.302l1.557.23c.445.066.561.622.197.941l-1.275,1.117c-.145.127-.225.309-.215.488l.088,1.577c.025.451-.488.794-.868.582l-1.33-.745c-.151-.085-.343-.085-.514,0l-1.503.745c-.429.213-.863-.131-.733-.582l.453-1.577c.051-.179.013-.362-.102-.488l-1.016-1.117c-.29-.319-.045-.875.415-.941l1.61-.23c.183-.026.351-.139.45-.302l.874-1.435c.25-.41.835-.41.99,0Z" fill="url(#linear-gradient-263)"/>
      <Path d="M275.077,179.08c-.129,0-.257-.032-.373-.098l-1.33-.744c-.079-.043-.184-.041-.281.007l-1.502.743c-.292.147-.621.116-.856-.081-.227-.189-.314-.493-.228-.793l.453-1.577c.027-.095.01-.189-.047-.251l-1.016-1.117c-.189-.207-.241-.497-.141-.776.111-.311.382-.534.705-.58l1.61-.229c.109-.017.211-.085.272-.185l.874-1.434c.175-.288.492-.465.819-.424.287.026.518.2.618.466l.542,1.434c.029.077.096.129.184.143l1.556.229c.291.043.514.235.595.513.089.303-.017.642-.27.864l-1.276,1.117c-.086.075-.136.185-.13.286l.088,1.577c.017.308-.143.605-.417.776-.142.089-.297.134-.45.134ZM273.964,172.036c-.1,0-.234.048-.319.188l-.874,1.435c-.138.226-.373.383-.628.419l-1.61.229c-.166.024-.269.152-.306.255-.018.049-.049.173.041.272l1.016,1.117c.174.192.233.463.157.726l-.453,1.577c-.032.109-.007.208.067.271.082.067.199.073.314.018l1.503-.744c.244-.121.523-.118.746.005l1.331.745c.09.049.207.04.314-.024.094-.059.191-.175.183-.325l-.088-1.577c-.014-.255.098-.513.3-.689l1.276-1.118c.13-.113.147-.254.12-.347-.015-.051-.06-.14-.189-.159l-1.556-.229c-.268-.04-.484-.212-.578-.461l-.542-1.435h0c-.041-.107-.129-.138-.197-.145-.009,0-.018-.001-.027-.001Z" fill="url(#linear-gradient-264)"/>
      <Path d="M284.918,179.08c-.129,0-.257-.032-.373-.098l-1.33-.744c-.079-.043-.184-.041-.281.007l-1.502.743c-.293.147-.621.116-.856-.081-.227-.189-.314-.493-.228-.793l.453-1.577c.027-.095.01-.189-.047-.251l-1.016-1.117c-.189-.207-.241-.497-.141-.776.111-.311.381-.534.705-.58l1.611-.229c.109-.017.211-.085.271-.185l.875-1.434c.175-.288.49-.465.819-.424.287.026.518.2.618.466l.542,1.434c.029.077.096.129.184.143l1.556.229c.291.043.514.235.595.513.089.303-.017.642-.27.864l-1.276,1.117c-.086.075-.136.185-.13.286l.087,1.577c.017.308-.142.605-.417.776-.142.089-.297.134-.45.134ZM283.806,172.036c-.1,0-.234.048-.319.188l-.874,1.435c-.137.226-.372.382-.628.419l-1.611.229c-.166.024-.269.152-.305.255-.018.049-.049.173.041.272l1.016,1.117c.174.191.232.463.157.726l-.453,1.577c-.032.109-.007.208.067.271.082.067.199.073.314.018l1.503-.744c.245-.121.523-.118.746.005l1.331.745c.09.049.207.04.314-.024.094-.059.191-.175.183-.325l-.087-1.577c-.014-.255.098-.513.3-.689l1.276-1.118c.13-.113.147-.254.12-.347-.015-.051-.06-.14-.189-.159l-1.556-.229c-.269-.04-.484-.212-.578-.461l-.542-1.435h0c-.041-.107-.129-.138-.197-.145-.009,0-.018-.001-.027-.001Z" fill="url(#linear-gradient-265)"/>
      <Path d="M294.76,179.08c-.13,0-.257-.032-.373-.098l-1.33-.744c-.079-.042-.184-.042-.281.007l-1.502.743c-.293.147-.621.116-.856-.081-.227-.189-.314-.493-.228-.793l.454-1.577c.027-.095.01-.189-.047-.251l-1.017-1.117c-.189-.207-.241-.498-.14-.777.111-.311.382-.533.705-.579l1.611-.229c.109-.017.211-.085.271-.185l.875-1.434c.175-.288.489-.465.819-.424.287.026.518.2.618.466l.542,1.434c.029.077.096.129.184.143l1.556.229c.291.043.514.235.595.513.089.303-.018.642-.271.864l-1.275,1.117c-.086.075-.136.185-.13.285l.087,1.578c.018.308-.142.604-.417.776-.143.089-.298.134-.45.134ZM293.647,172.036c-.1,0-.234.048-.319.188l-.875,1.435c-.137.226-.372.382-.628.419l-1.611.229c-.167.024-.269.152-.305.255-.018.049-.049.174.04.272l1.017,1.117c.174.191.232.463.157.726l-.454,1.577c-.032.109-.007.208.068.271.081.067.199.073.314.018l1.502-.744c.244-.121.523-.118.746.005l1.33.745c.091.05.208.04.314-.024.094-.059.191-.175.183-.325l-.087-1.577c-.015-.255.098-.513.3-.69l1.275-1.117c.13-.113.147-.254.12-.347-.015-.051-.06-.14-.189-.159l-1.556-.229c-.269-.04-.484-.212-.578-.461l-.542-1.435h0c-.041-.107-.129-.138-.197-.145-.009,0-.018-.001-.027-.001Z" fill="url(#linear-gradient-266)"/>
      </G>
      </G>
      <Rect x="47.645" y="88.803" width="59.474" height="38.401" rx="1.894" ry="1.894" fill="url(#linear-gradient-267)"/>
      <G clipPath="url(#clippath-9)">
      <Polygon points="77.381 108.003 47.645 88.803 107.118 88.803 77.381 108.003" fill="url(#linear-gradient-268)"/>
      <G clipPath="url(#clippath-10)">
      <G>
      <Path d="M60.815,59.804h21.799c.945,0,1.711.767,1.711,1.711v55.743c0,.945-.767,1.711-1.711,1.711h-21.799c-.945,0-1.711-.767-1.711-1.711v-55.743c0-.945.767-1.712,1.712-1.712Z" transform="translate(-19.372 19.844) rotate(-13.899)" fill="url(#linear-gradient-269)"/>
      <Path d="M75.188,58.052l-21.16,5.236c-.918.227-1.477,1.155-1.25,2.072l2.691,10.873c.004.016.021.026.037.022l24.423-6.044c.016-.004.026-.021.022-.037l-2.691-10.873c-.227-.918-1.155-1.477-2.073-1.25Z" fill="url(#linear-gradient-270)"/>
      <G>
      <Rect x="57.616" y="65.393" width="1.712" height="7.709" transform="translate(-14.921 16.072) rotate(-13.898)" fill="url(#linear-gradient-271)"/>
      <Rect x="59.71" y="65.034" width=".428" height="7.709" transform="translate(-14.794 16.413) rotate(-13.9)" fill="url(#linear-gradient-272)"/>
      <Rect x="60.59" y="64.551" width="2.567" height="7.709" transform="translate(-14.621 16.866) rotate(-13.899)" fill="url(#linear-gradient-273)"/>
      <Rect x="63.437" y="64.059" width=".856" height="7.709" transform="translate(-14.446 17.333) rotate(-13.901)" fill="url(#linear-gradient-274)"/>
      <Rect x="64.752" y="63.628" width="1.712" height="7.709" transform="translate(-14.288 17.734) rotate(-13.898)" fill="url(#linear-gradient-275)"/>
      <Rect x="66.804" y="63.278" width=".428" height="7.709" transform="translate(-14.165 18.065) rotate(-13.9)" fill="url(#linear-gradient-276)"/>
      <Rect x="67.709" y="62.896" width="1.712" height="7.709" transform="translate(-14.026 18.423) rotate(-13.898)" fill="url(#linear-gradient-277)"/>
      <Rect x="69.698" y="62.562" width=".428" height="7.709" transform="translate(-13.91 18.744) rotate(-13.903)" fill="url(#linear-gradient-278)"/>
      <Rect x="70.29" y="62.151" width="2.567" height="7.709" transform="translate(-13.76 19.126) rotate(-13.899)" fill="url(#linear-gradient-279)"/>
      <Rect x="73.179" y="61.542" width="1.712" height="7.709" transform="translate(-13.543 19.703) rotate(-13.901)" fill="url(#linear-gradient-280)"/>
      </G>
      <G>
      <Path d="M70.287,116.994h0c-.459.114-.923-.166-1.036-.625l-8.408-33.978c-.114-.459.166-.923.625-1.036h0c.459-.114.923.166,1.036.625l8.408,33.978c.114.459-.166.923-.625,1.036Z" fill="url(#linear-gradient-281)"/>
      <Path d="M74.52,115.946h0c-.459.113-.923-.166-1.036-.625l-2.468-9.975c-.114-.459.166-.923.625-1.036h0c.459-.114.923.166,1.036.625l2.468,9.975c.113.459-.166.923-.625,1.036Z" fill="url(#linear-gradient-282)"/>
      <Rect x="78.801" y="94.519" width="1.712" height="19.856" rx=".629" ry=".629" transform="translate(-22.743 22.175) rotate(-13.889)" fill="url(#linear-gradient-283)"/>
      <Rect x="73.32" y="78.97" width="1.712" height="6.661" rx=".731" ry=".731" transform="translate(-17.595 20.224) rotate(-13.897)" fill="url(#linear-gradient-284)"/>
      <Rect x="84.228" y="106.848" width="1.712" height="6.388" rx=".724" ry=".724" transform="translate(-23.927 23.641) rotate(-13.889)" fill="url(#linear-gradient-285)"/>
      </G>
      </G>
      <G>
      <Rect x="69.496" y="65.499" width="25.221" height="59.166" rx="1.712" ry="1.712" transform="translate(17.524 -12.673) rotate(9.876)" fill="url(#linear-gradient-286)"/>
      <Path d="M97.919,67.807l-21.475-3.739c-.931-.162-1.818.461-1.98,1.393l-1.921,11.034c-.003.017.008.033.025.035l24.787,4.315c.017.003.033-.008.035-.025l1.921-11.035c.162-.931-.461-1.818-1.393-1.98Z" fill="url(#linear-gradient-287)"/>
      <G>
      <Rect x="74.254" y="70.458" width="7.709" height="1.711" transform="translate(-5.548 136.03) rotate(-80.122)" fill="#fff"/>
      <Rect x="75.727" y="71.357" width="7.709" height=".428" transform="translate(-4.578 137.697) rotate(-80.124)" fill="#fff"/>
      <Rect x="77.706" y="70.631" width="7.709" height="2.567" transform="translate(-3.277 139.933) rotate(-80.125)" fill="#fff"/>
      <Rect x="79.728" y="71.839" width="7.709" height=".856" transform="translate(-1.943 142.223) rotate(-80.129)" fill="#fff"/>
      <Rect x="81.496" y="71.719" width="7.709" height="1.712" transform="translate(-.786 144.214) rotate(-80.125)" fill="#fff"/>
      <Rect x="82.927" y="72.61" width="7.709" height=".428" transform="translate(.149 145.825) rotate(-80.122)" fill="#fff"/>
      <Rect x="84.497" y="72.241" width="7.709" height="1.712" transform="translate(1.186 147.605) rotate(-80.126)" fill="#fff"/>
      <Rect x="85.864" y="73.121" width="7.709" height=".428" transform="translate(2.079 149.142) rotate(-80.122)" fill="#fff"/>
      <Rect x="87.55" y="72.345" width="7.709" height="2.567" transform="translate(3.19 151.051) rotate(-80.125)" fill="#fff"/>
      <Rect x="90.049" y="73.208" width="7.709" height="1.712" transform="translate(4.833 153.875) rotate(-80.125)" fill="#fff"/>
      </G>
      <G>
      <Path d="M69.672,119.771h0c-.466-.081-.777-.524-.696-.99l6.003-34.484c.081-.466.524-.777.99-.696h0c.466.081.777.524.696.99l-6.003,34.484c-.081.466-.524.777-.99.696Z" fill="url(#linear-gradient-288)"/>
      <Path d="M73.968,120.519h0c-.466-.081-.777-.524-.696-.99l1.763-10.124c.081-.466.524-.777.99-.696h0c.466.081.777.524.696.99l-1.763,10.124c-.081.466-.524.777-.99.696Z" fill="url(#linear-gradient-289)"/>
      <Rect x="82.449" y="102.139" width="1.711" height="19.856" rx=".629" ry=".629" transform="translate(20.461 -12.63) rotate(9.878)" fill="url(#linear-gradient-290)"/>
      <Rect x="86.362" y="86.26" width="1.712" height="6.661" rx=".731" ry=".731" transform="translate(16.656 -13.63) rotate(9.875)" fill="url(#linear-gradient-291)"/>
      <Rect x="85.159" y="116.181" width="1.712" height="6.388" rx=".724" ry=".724" transform="translate(21.749 -12.984) rotate(9.876)" fill="url(#linear-gradient-292)"/>
      </G>
      </G>
      </G>
      </G>
      <G>
      <Path d="M96.426,275.671c-.26,2.454-1.98,4.443-3.842,4.443s-3.159-1.989-2.899-4.443c.26-2.454,1.98-4.443,3.842-4.443s3.159,1.989,2.899,4.443Z" fill="url(#linear-gradient-293)"/>
      <Path d="M73.808,275.671c-.26,2.454-1.98,4.443-3.842,4.443s-3.159-1.989-2.899-4.443c.26-2.454,1.98-4.443,3.842-4.443s3.159,1.989,2.899,4.443Z" fill="url(#linear-gradient-294)"/>
      <Path d="M95.55,221.426h-15.494c-.284,0-.554-.12-.744-.331-.19-.211-.281-.492-.251-.774l3.375-31.795c.19-1.792,1.746-3.196,3.541-3.196h10.889c.9,0,1.715.355,2.296,1.001.584.649.852,1.504.756,2.406l-3.374,31.795c-.054.509-.483.895-.995.895ZM81.168,219.426h13.482l3.279-30.9c.036-.332-.055-.637-.254-.857-.196-.219-.484-.339-.809-.339h-10.889c-.76,0-1.471.644-1.552,1.407l-3.258,30.69Z" fill="#23143d"/>
      <Path d="M111.586,201.394h-31.025c-3.568,0-6.767,2.892-7.146,6.46l-6.527,61.495c-.379,3.568,2.207,6.46,5.775,6.46h31.025c3.568,0,6.767-2.892,7.146-6.46l6.527-61.495c.379-3.568-2.207-6.46-5.775-6.46Z" fill="url(#linear-gradient-295)"/>
      <Path d="M101.41,201.394h-31.025c-3.568,0-6.767,2.892-7.146,6.46l-6.527,61.495c-.379,3.568,2.207,6.46,5.775,6.46h31.025c3.568,0,6.767-2.892,7.146-6.46l6.527-61.495c.379-3.568-2.207-6.46-5.775-6.46Z" fill="url(#linear-gradient-296)"/>
      <G>
      <Path d="M70.021,276.06c-.009,0-.018,0-.027-.001-.137-.015-.237-.138-.222-.275l7.899-74.416c.015-.138.139-.237.275-.223.137.015.237.138.222.275l-7.899,74.416c-.014.128-.122.224-.248.224Z" fill="#e8dff7"/>
      <Path d="M85.977,276.06c-.009,0-.018,0-.027-.001-.137-.015-.237-.138-.222-.275l7.899-74.416c.014-.138.139-.237.275-.223.137.015.237.138.222.275l-7.899,74.416c-.014.128-.122.224-.248.224Z" fill="#e8dff7"/>
      </G>
      </G>
      <Rect x="59.138" y="160.503" width="25.732" height="17.329" fill="url(#linear-gradient-297)"/>
      <Rect x="84.87" y="160.503" width="8.682" height="17.329" fill="url(#linear-gradient-298)"/>
      <Path d="M72.004,178.082c-.138,0-.25-.112-.25-.25v-17.329c0-.138.112-.25.25-.25s.25.112.25.25v17.329c0,.138-.112.25-.25.25Z" fill="#23143d"/>
      <Path d="M93.552,169.418h-34.414c-.138,0-.25-.112-.25-.25s.112-.25.25-.25h34.414c.138,0,.25.112.25.25s-.112.25-.25.25Z" fill="#23143d"/>
      <G>
      <Path d="M98.65,45.717l18.754,3.65c.203.039.374.177.455.367h0c.11.256-.087.539-.366.524l-13.355-.697-5.489-3.844Z" fill="url(#linear-gradient-299)"/>
      <Path d="M123.372,60.399c-.058.484-.786.804-2.253.478-4.019-.895-8.758-3.009-14.384-6.325-.035-.018-.065-.038-.099-.059-1.275-.777-10.851-6.661-10.851-6.661-1.702-1.058-2.62-1.688-3.651-2.759-.787-.817-.743-1.555-.472-1.989.051-.085.112-.16.182-.228.261-.27.62-.405,1.005-.461.558-.092,1.168-.015,1.631.065.307.053.636.144.972.264,1.031.352,2.163.942,3.081,1.458,3.047,1.695,6.064,3.457,9.05,5.258,2.916,1.766,5.81,3.57,8.661,5.445,2.243,1.473,4.477,2.975,6.606,4.615.383.296.559.623.523.899Z" fill="url(#linear-gradient-300)"/>
      <Polygon points="125.811 56.463 124.638 55.66 115.265 56.452 119.214 59.156 125.811 56.463" fill="url(#linear-gradient-301)"/>
      <Path d="M97.391,47.699l4.25,14.488c.155.529.514.974.998,1.237l.047.025c.19.103.423-.028.432-.244l.538-11.996-6.265-3.51Z" fill="url(#linear-gradient-302)"/>
      </G>
      <Path d="M97.165,113.461c-9.815,0-20.021-1.529-29.122-3.846-13.083-3.331-22.038-7.764-27.376-13.551-3.072-3.332-4.818-8.736-1.796-13.3.078-.116.232-.146.347-.07.115.076.146.231.07.347-2.873,4.338-1.193,9.497,1.746,12.685,5.27,5.714,14.144,10.1,27.131,13.406,21.766,5.542,49.886,6.57,63.538-7.158,4.48-4.504,6.806-10.16,6.552-15.926-.322-7.287-4.735-14.712-12.762-21.472-.105-.089-.119-.247-.03-.353.089-.106.247-.119.352-.03,8.137,6.852,12.611,14.402,12.939,21.832.261,5.907-2.118,11.696-6.697,16.301-8.065,8.11-21.091,11.135-34.894,11.135Z" fill="#23143d"/>
      </G>
      </G>
    </Svg>
  );
}
