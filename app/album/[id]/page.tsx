"use client";

import { useParams } from "next/navigation";
import MusicPage from "@/components/MusicPage";

export default function AlbumPage() {
  const { id } = useParams<{ id: string }>();
  return <MusicPage kind="album" id={id} />;
}
