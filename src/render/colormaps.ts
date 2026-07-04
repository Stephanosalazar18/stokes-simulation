/**
 * 12-stop polynomial approximation of the viridis colormap.
 * Based on the well-known public-domain fit from https://www.shadertoy.com/view/WlfXRN.
 * t ∈ [0, 1] → RGB in [0, 1].
 */
export function viridis(t: number): [number, number, number] {
  // 6th-degree polynomial coefficients per channel
  const c0 = [0.2777273272234177, 0.005407344544726578, 0.3340998053353061];
  const c1 = [0.1050930431085774, 1.404613529898575, 1.384590162594685];
  const c2 = [-0.3308618287255563, 0.214847559468213, 0.09509516302823659];
  const c3 = [-4.634230498983486, -5.799100973351585, -19.33244095627987];
  const c4 = [6.228269936347081, 14.17993336680509, 56.69055260068105];
  const c5 = [4.776384997670288, -13.74514537774601, -65.35303263337234];
  const c6 = [-5.435455855934631, 4.645852612178535, 26.3124352495832];

  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  const t6 = t5 * t;

  return [
    c0[0] + c1[0] * t + c2[0] * t2 + c3[0] * t3 + c4[0] * t4 + c5[0] * t5 + c6[0] * t6,
    c0[1] + c1[1] * t + c2[1] * t2 + c3[1] * t3 + c4[1] * t4 + c5[1] * t5 + c6[1] * t6,
    c0[2] + c1[2] * t + c2[2] * t2 + c3[2] * t3 + c4[2] * t4 + c5[2] * t5 + c6[2] * t6,
  ];
}
