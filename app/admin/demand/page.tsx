"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DemandRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/warehouse/demand");
  }, [router]);
  return null;
}
