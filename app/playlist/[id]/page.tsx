"use client";

import { useParams } from "next/navigation";
import MusicPage from "@/components/MusicPage";

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  return <MusicPage kind="playlist" id={id} />;
}
