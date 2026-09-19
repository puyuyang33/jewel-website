import type { ArtworkVariant } from "@/components/marketing/content";
import { cn } from "@/lib/utils";

import styles from "./marketing.module.css";

const palettes: Record<
  ArtworkVariant,
  { metal: string; stone: string; shadow: string }
> = {
  orbit: { metal: "#a98242", stone: "#8a503c", shadow: "#4d382d" },
  pendant: { metal: "#91733d", stone: "#637064", shadow: "#39453c" },
  twin: { metal: "#77736d", stone: "#7f2736", shadow: "#3d252a" },
  arc: { metal: "#9b958c", stone: "#c8b081", shadow: "#5f584e" },
  signet: { metal: "#4f504b", stone: "#a98242", shadow: "#282924" },
  relic: { metal: "#aa8243", stone: "#334b69", shadow: "#2e3540" },
};

export function HeroJewelryStudy() {
  return (
    <div
      className={styles.heroStudy}
      role="img"
      aria-label="Abstract drafting study of a garnet held inside two fine gold orbits"
    >
      <span className={styles.heroOrbit} />
      <span className={styles.heroOrbit} />
      <span className={styles.heroGem} />
      <svg
        className="absolute inset-x-[11%] top-[9%] z-[1] h-[64%] w-[78%]"
        viewBox="0 0 400 400"
        aria-hidden="true"
      >
        <path
          d="M41 203c38-115 280-115 318 0-41 122-277 122-318 0Z"
          fill="none"
          stroke="#211f1b"
          strokeOpacity=".16"
        />
        <path
          d="M200 36v328M36 200h328"
          fill="none"
          stroke="#211f1b"
          strokeDasharray="2 10"
          strokeOpacity=".22"
        />
        <circle
          cx="200"
          cy="200"
          r="129"
          fill="none"
          stroke="#a98242"
          strokeOpacity=".28"
        />
        <path
          d="m87 91 18 7M295 302l18 7M97 308l12-17M298 99l12-17"
          fill="none"
          stroke="#7f2736"
          strokeWidth="2"
        />
      </svg>
      <div className={styles.heroNotations} aria-hidden="true">
        <span>Study 06 / orbit</span>
        <span>Scale 2:1</span>
      </div>
    </div>
  );
}

export function JewelryStudy({
  variant,
  className,
}: {
  variant: ArtworkVariant;
  className?: string;
}) {
  const palette = palettes[variant];

  return (
    <div
      className={cn(styles.study, className)}
      aria-hidden="true"
      data-artwork={variant}
    >
      <svg className={styles.studySvg} viewBox="0 0 320 390">
        <g
          fill="none"
          stroke={palette.metal}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {variant === "orbit" && (
            <>
              <ellipse cx="160" cy="210" rx="99" ry="112" strokeWidth="5" />
              <ellipse
                cx="160"
                cy="150"
                rx="68"
                ry="25"
                stroke={palette.shadow}
                strokeWidth="3"
                transform="rotate(-9 160 150)"
              />
              <path d="M103 166c17 18 27 33 31 59M216 157c-19 19-30 40-34 66" />
              <path
                d="m160 105 35 19-5 43-38 20-31-24 5-39Z"
                fill={palette.stone}
                stroke={palette.shadow}
                strokeWidth="3"
              />
              <path
                d="m160 105-8 82m-26-63 64 43m5-43-74 39"
                stroke="#f6f2ea"
                strokeOpacity=".38"
              />
            </>
          )}
          {variant === "pendant" && (
            <>
              <path d="M160 40c-3 42-4 74 0 103" strokeWidth="3" />
              <circle
                cx="160"
                cy="48"
                r="10"
                stroke={palette.shadow}
                strokeWidth="3"
              />
              <path d="M102 142h116l-14 150-44 50-44-50Z" strokeWidth="5" />
              <path
                d="m160 165 38 33-15 82-23 26-27-27-13-81Z"
                fill={palette.stone}
                stroke={palette.shadow}
                strokeWidth="3"
              />
              <path
                d="M102 142l58 49 58-49M116 292l44-41 44 41"
                strokeWidth="2"
              />
              <path
                d="m120 198 40 53 38-53"
                stroke="#f6f2ea"
                strokeOpacity=".4"
              />
            </>
          )}
          {variant === "twin" && (
            <>
              <path d="M104 56v158M216 56v158" strokeWidth="3" />
              <circle cx="104" cy="54" r="9" fill={palette.metal} />
              <circle cx="216" cy="54" r="9" fill={palette.metal} />
              <path
                d="m104 140-32 64 32 85 32-85Z"
                fill={palette.stone}
                stroke={palette.shadow}
                strokeWidth="3"
              />
              <path
                d="m216 120-27 74 27 108 27-108Z"
                fill={palette.stone}
                stroke={palette.shadow}
                strokeWidth="3"
              />
              <path
                d="m73 204 63 0M189 194h54M104 140v149M216 120v182"
                stroke="#f6f2ea"
                strokeOpacity=".42"
              />
              <path d="M104 289v42M216 302v29" strokeWidth="3" />
            </>
          )}
          {variant === "arc" && (
            <>
              <path d="M58 244c29-122 175-159 235-40" strokeWidth="14" />
              <path
                d="M63 246c31-104 163-139 220-38"
                stroke={palette.shadow}
                strokeWidth="2"
              />
              <path
                d="m188 93 45 31-8 56-49 26-42-35 9-54Z"
                fill={palette.stone}
                stroke={palette.shadow}
                strokeWidth="4"
              />
              <path
                d="m188 93-12 113m-33-89 82 63m8-56-99 47"
                stroke="#f6f2ea"
                strokeOpacity=".45"
              />
              <path
                d="M79 221l29 18m-15-54 32 18m91-8 18 31m10-51 16 30"
                strokeWidth="3"
              />
            </>
          )}
          {variant === "signet" && (
            <>
              <path
                d="M89 100h142l26 84-32 111H95L63 184Z"
                fill={palette.metal}
                stroke={palette.shadow}
                strokeWidth="4"
              />
              <path
                d="M108 124h104l17 62-23 82h-92l-23-82Z"
                fill="#2f302c"
                stroke="#a98242"
                strokeWidth="2"
              />
              <path
                d="M108 268 212 124"
                stroke={palette.stone}
                strokeWidth="7"
              />
              <path
                d="m91 186 138 0M160 124v144"
                stroke="#f6f2ea"
                strokeOpacity=".15"
              />
            </>
          )}
          {variant === "relic" && (
            <>
              <ellipse cx="160" cy="220" rx="104" ry="111" strokeWidth="8" />
              <path
                d="M86 145c28-35 50-49 74-49s47 14 74 49"
                stroke={palette.shadow}
                strokeWidth="4"
              />
              <path
                d="m114 112 35 14-3 54-39 13-21-34Z"
                fill={palette.stone}
                stroke={palette.shadow}
                strokeWidth="3"
              />
              <path
                d="m206 107 34 25-11 51-42 7-16-41Z"
                fill={palette.stone}
                stroke={palette.shadow}
                strokeWidth="3"
              />
              <path
                d="m114 112-7 81m42-67-42 67m99-86-19 83m53-58-53 58"
                stroke="#f6f2ea"
                strokeOpacity=".38"
              />
              <path d="M146 153h26" stroke={palette.metal} strokeWidth="5" />
            </>
          )}
        </g>
      </svg>
      <span className="text-stone absolute right-4 bottom-4 font-mono text-[0.58rem] tracking-[0.18em] uppercase">
        VA / {variant}
      </span>
    </div>
  );
}
