import { ImageResponse } from "next/og";

export const alt =
  "Veyra Atelier — private jewelry design, shown with an abstract garnet and brass orbit";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#f6f2ea",
        color: "#211f1b",
        fontFamily: "Georgia, serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 34,
          display: "flex",
          border: "1px solid rgba(33,31,27,.18)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 760,
          display: "flex",
          width: 1,
          height: 630,
          background: "rgba(33,31,27,.16)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 62,
          left: 70,
          display: "flex",
          alignItems: "center",
          gap: 18,
          fontFamily: "Arial, sans-serif",
          fontSize: 18,
          letterSpacing: 6,
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            display: "flex",
            width: 19,
            height: 19,
            border: "1px solid #a98242",
            transform: "rotate(45deg)",
          }}
        />
        Veyra Atelier
      </div>
      <div
        style={{
          position: "absolute",
          top: 180,
          left: 70,
          display: "flex",
          width: 630,
          flexDirection: "column",
        }}
      >
        <span
          style={{
            fontFamily: "Arial, sans-serif",
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: 4,
            color: "#7f2736",
            textTransform: "uppercase",
          }}
        >
          Private jewelry design
        </span>
        <span
          style={{
            marginTop: 22,
            fontSize: 74,
            lineHeight: 0.94,
            letterSpacing: -4,
          }}
        >
          Jewelry imagined around your story.
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          top: 90,
          left: 810,
          display: "flex",
          width: 320,
          height: 450,
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid rgba(169,130,66,.38)",
          borderRadius: "50% 50% 24px 24px",
          background: "#e9dfcf",
        }}
      >
        <div
          style={{
            position: "absolute",
            display: "flex",
            width: 245,
            height: 92,
            border: "2px solid rgba(33,31,27,.7)",
            borderRadius: "50%",
            transform: "rotate(-14deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            display: "flex",
            width: 188,
            height: 74,
            border: "2px solid #a98242",
            borderRadius: "50%",
            transform: "rotate(24deg)",
          }}
        />
        <div
          style={{
            display: "flex",
            width: 98,
            height: 112,
            background: "#7f2736",
            clipPath:
              "polygon(50% 0%, 90% 22%, 100% 67%, 68% 100%, 29% 91%, 0 54%, 13% 16%)",
            transform: "rotate(8deg)",
          }}
        />
        <span
          style={{
            position: "absolute",
            right: 26,
            bottom: 22,
            display: "flex",
            fontFamily: "Arial, sans-serif",
            fontSize: 11,
            letterSpacing: 2,
            color: "#746e65",
            textTransform: "uppercase",
          }}
        >
          Study 06 / orbit
        </span>
      </div>
      <span
        style={{
          position: "absolute",
          bottom: 57,
          left: 70,
          display: "flex",
          fontFamily: "Arial, sans-serif",
          fontSize: 14,
          letterSpacing: 2,
          color: "#746e65",
          textTransform: "uppercase",
        }}
      >
        Original concepts · Considered materials · Clear process
      </span>
    </div>,
    size,
  );
}
