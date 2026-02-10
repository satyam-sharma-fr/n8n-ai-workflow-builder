"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TopBar } from "@/components/top-bar";
import { ChatPanel } from "@/components/chat/chat-panel";
import { WorkflowCanvas } from "@/components/canvas/workflow-canvas";
import { OnboardingDialog } from "@/components/onboarding-dialog";

export default function Home() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar />
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        <ResizablePanel
          defaultSize="30%"
          minSize="250px"
          maxSize="45%"
          className="border-r"
        >
          <ChatPanel />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="70%" minSize="40%">
          <WorkflowCanvas />
        </ResizablePanel>
      </ResizablePanelGroup>
      <OnboardingDialog />
    </div>
  );
}
