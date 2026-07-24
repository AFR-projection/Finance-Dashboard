import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function DeniedPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-primary">Akses ditolak</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Owner menolak permintaan masuk, atau sesi tidak valid.
      </p>
      <Link href="/access" className={cn(buttonVariants(), "mt-6")}>
        Coba minta izin lagi
      </Link>
    </div>
  );
}
