import { TelegramBotService } from '../services/TelegramBotService';

declare global {
  var telegramBot: TelegramBotService | undefined;
}

// This export is needed to make this a module
export {};