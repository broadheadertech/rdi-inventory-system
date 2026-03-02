"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RestockAIRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/warehouse/restock-ai");
  }, [router]);
  return null;
}
