"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 flex items-center justify-between md:hidden">
      <div className="font-[family-name:var(--font-display)] text-xl text-primary">Ledgerly</div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className="inline-flex">
          <Button variant="outline" size="icon" aria-label="Open menu">
            <Menu className="size-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <div onClick={() => setOpen(false)}>
            <AppSidebar />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
