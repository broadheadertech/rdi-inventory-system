"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RestockRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/inventory");
  }, [router]);
  return null;
}
