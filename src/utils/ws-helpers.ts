import { RawData } from "ws";
import { IRequestMessage, IResponseMessage, MessageType, WS } from "../types";

export const sendMessage = <T>(ws: WS, type: MessageType, data: T) => {
  const strMessage: string = JSON.stringify({
    type,
    data: JSON.stringify(data) as T,
    id: 0,
  });
  ws.send(strMessage);
};

export const parseMessage = <T>(data: RawData): IResponseMessage<T> => {
  const message = JSON.parse(data.toString()) as IRequestMessage;
  return { ...message, data: message.data ? JSON.parse(message.data) : "" };
};
