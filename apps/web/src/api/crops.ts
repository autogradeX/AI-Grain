import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { Crop } from "./types";

export function useCrops(includeArchived = false) {
  return useQuery({
    queryKey: ["crops", includeArchived],
    queryFn: () => api.get<Crop[]>(`/crops?includeArchived=${includeArchived}`),
    staleTime: 60_000,
  });
}

/** The crop with this key, or undefined while loading or when it doesn't exist. */
export function useCrop(key: string | null | undefined) {
  const crops = useCrops(true);
  return crops.data?.find((c) => c.key === key);
}
