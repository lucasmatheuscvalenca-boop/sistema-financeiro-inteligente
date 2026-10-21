import { todayInTimeZone, type ISODate } from "@/domain/dates";
import type { Database } from "../db/client";

/**
 * Contexto de toda chamada de serviço. O userId vem SEMPRE da sessão validada no
 * servidor, nunca de dados enviados pelo cliente. Todo acesso a dados filtra por ele.
 */
export interface ServiceContext {
  db: Database;
  userId: string;
  today: ISODate;
  timezone: string;
}

export function makeContext(db: Database, userId: string, timezone = "America/Sao_Paulo", today?: ISODate): ServiceContext {
  return { db, userId, timezone, today: today ?? todayInTimeZone(timezone) };
}
