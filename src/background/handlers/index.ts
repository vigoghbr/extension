import { handleMessages as handleAutocomplete } from "@/background/handlers/autocomplete";
import { handleMessages as handleAnswers } from "@/background/handlers/answers";
import { handleMessages as handleTransforms } from "@/background/handlers/transforms";
import { handleMessages as handleChat } from "@/background/handlers/chat";
import { handleMessages as handleFiles } from "@/background/handlers/files";
import type { BackgroundMessageHandler } from "@/background/handlers/types";

export const toolHandlers: BackgroundMessageHandler[] = [
  handleAutocomplete,
  handleAnswers,
  handleTransforms,
  handleChat,
  handleFiles,
];
