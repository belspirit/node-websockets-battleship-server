import WebSocket from "ws";

export type WS = WebSocket & { isAlive: boolean; user: IUser };

export enum MessageType {
  reg = "reg",
  create_room = "create_room",
  add_user_to_room = "add_user_to_room",
  create_game = "create_game",
  start_game = "start_game",
  turn = "turn",
  attack = "attack",
  randomAttack = "randomAttack",
  finish = "finish",
  update_room = "update_room",
  update_winners = "update_winners",
  add_ships = "add_ships",
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

export interface IShip {
  position: { x: number; y: number };
  direction: boolean;
  type: "huge" | "large" | "medium" | "small";
  length: 1 | 2 | 3 | 4;
  health: 1 | 2 | 3 | 4;
  killed: boolean;
}

export interface IAttack {
  x: number;
  y: number;
}

export interface IAttackResponse {
  position: {
    x: number;
    y: number;
  };
  status: "miss" | "killed" | "shot";
}

export interface IBoard {
  gameId: number;
  userId: number;
  ships: IShip[];
  attacks: IAttackResponse[];
}

export interface IUser {
  name: string;
  password: string;
  userId: number;
}
export interface IRoom {
  roomId: number;
  roomUsers: { name: string; userId: number }[];
}
export interface IGame {
  gameId: number;
  gameUserIds: number[];
  turnId: number;
  boards: IBoard[];
}

export interface IWin {
  name: string;
  wins: number;
}

export interface IRegisterUserResponse {
  name: string;
  index: number;
  error: boolean;
  errorText: string;
}
