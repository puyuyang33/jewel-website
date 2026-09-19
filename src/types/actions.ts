export interface ActionFailure {
  ok: false;
  message: string;
  fieldErrors?: Record<string, string[]>;
  code?: string;
}

export interface ActionSuccess<T = undefined> {
  ok: true;
  message: string;
  data?: T;
}

export type ActionResult<T = undefined> = ActionSuccess<T> | ActionFailure;

export const initialActionResult: ActionResult = {
  ok: true,
  message: "",
};
