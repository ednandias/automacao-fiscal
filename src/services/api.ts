import axios from "axios";

export const api = axios.create({
  baseURL: "https://node.ziphub.com.br",
  timeout: 60000,
});
