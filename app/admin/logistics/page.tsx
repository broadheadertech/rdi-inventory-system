"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LogisticsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/warehouse/logistics");
  }, [router]);
  return null;
}
