export const deploymentTracks = ["production", "free-demo"] as const;

export type DeploymentTrack = (typeof deploymentTracks)[number];

export function resolveDeploymentTrack(
  value: string | undefined,
): DeploymentTrack {
  return value === "free-demo" ? "free-demo" : "production";
}

export function resolveImageUploadLimitMegabytes(track: DeploymentTrack) {
  void track;
  return 4;
}

export const deploymentTrack = resolveDeploymentTrack(
  process.env.NEXT_PUBLIC_DEPLOYMENT_TRACK,
);

export const deployment = {
  track: deploymentTrack,
  isFreeDemo: deploymentTrack === "free-demo",
  imageUploadMegabytes: resolveImageUploadLimitMegabytes(deploymentTrack),
} as const;
