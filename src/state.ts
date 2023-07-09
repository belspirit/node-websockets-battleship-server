import { IGame, IRoom, IUser, IWin } from "./types";

class State {
  users: IUser[] = [];
  userId: number = 0;
  rooms: IRoom[] = [];
  roomId: number = 0;
  games: IGame[] = [];
  gameId: number = 0;
  winners: IWin[] = [];
}

export default new State();
