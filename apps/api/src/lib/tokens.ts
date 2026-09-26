import jwt from "jsonwebtoken";
import type { AuthenticatedUser } from "../types.js";

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
  return secret;
};

export const createAccessToken = (identity: AuthenticatedUser) => jwt.sign(identity, getSecret(), { expiresIn: "8h" });

export const verifyAccessToken = (token: string) => jwt.verify(token, getSecret()) as AuthenticatedUser;
