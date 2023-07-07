import WebSocket from "ws";

export type WS = WebSocket & { isAlive: boolean };

export enum MessageType {
  reg = "reg",
  create_room = "create_room",
  add_user_to_room = "add_user_to_room",
  create_game = "create_game",
  start_game = "start_game",
  turn = "turn",
  attack = "attack",
  finish = "finish",
  update_room = "update_room",
  update_winners = "update_winners",
}

export interface IRequestMessage {
  type: MessageType;
  data: string;
  id: number;
}

export interface IResponseMessage<T> {
  type: MessageType;
  data: T;
  id: number;
}

export interface IUser {
  name: string;
  password: string;
  index?: number;
}
export interface IRoom {
  index: number;
  users: IUser[];
}
export interface IGame {
  index: number;
  users: IGame[];
}

export interface IRegResponseData {
  name: string;
  index: number;
  error: boolean;
  errorText: string | undefined;
}
