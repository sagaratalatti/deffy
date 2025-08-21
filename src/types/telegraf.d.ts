import { Context as TelegrafContext, Update } from 'telegraf';

declare module 'telegraf' {
  interface Context<U extends Update = Update> extends TelegrafContext<U> {
    session?: {
      lastCallbackData?: string;
      [key: string]: any;
    };
  }
}