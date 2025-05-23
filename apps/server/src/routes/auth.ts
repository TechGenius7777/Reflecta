import prisma from "../db/client";
import authenticate from "../middlewares/authenticate";
import { Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import express, { type RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { userRegisterValidation, userLoginValidation } from "validation";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

const router = express.Router();

router.post("/register", (async (request, response) => {
  const { email, username, password, confirmPassword } = request.body;
  try {
    const value = await userRegisterValidation.parseAsync({
      email,
      username,
      password,
      confirmPassword,
    });
    const hash = await argon2.hash(value.password);
    await prisma.user.create({
      data: {
        email: value.email,
        username: value.username,
        password: hash,
      },
    });
    response.json({
      success: true,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({
        success: false,
        error: fromZodError(error),
      });
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      response.status(400).json({
        success: false,
        error: error.message,
      });
    } else {
      console.log(error);
      response.status(500).json({
        success: false,
      });
      throw error;
    }
  }
}) as RequestHandler);

router.post("/login", (async (request, response) => {
  const { email, password } = request.body;
  try {
    const value = await userLoginValidation.parseAsync({
      email,
      password,
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: {
        email: value.email,
      },
    });
    if (await argon2.verify(user.password, value.password)) {
      const accessToken = jwt.sign(
        { token: user.token },
        process.env.ACCESS_TOKEN_SECRET as string,
        {
          expiresIn: "60d",
        },
      );
      response
        .cookie("accessToken", accessToken, {
          maxAge: 60 * 60 * 24 * 60 * 1000,
          httpOnly: true,
          ...(process.env.NODE_ENV === "production" && {
            sameSite: "none",
            secure: true,
          }),
        })
        .cookie("isAuthenticated", "true", {
          maxAge: 60 * 60 * 24 * 60 * 1000,
          ...(process.env.NODE_ENV === "production" && {
            sameSite: "none",
            secure: true,
          }),
        })
        .json({
          success: true,
        });
    } else {
      response.status(400).json({
        success: false,
        error: "Wrong password",
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error instanceof ZodError) {
      response.status(400).json({
        success: false,
        error: fromZodError(error),
      });
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      response.status(400).json({
        success: false,
        error: error.message,
      });
    } else if (error.name === "NotFoundError") {
      response.status(400).json({
        success: false,
        error: "User not found",
      });
    } else {
      console.error(error.name);
      response.status(500).json({
        success: false,
      });
      throw error;
    }
  }
}) as RequestHandler);

router.get("/logout", (request, response) => {
  response.clearCookie("accessToken").clearCookie("isAuthenticated").json({
    success: true,
  });
});

router.get("/username", authenticate, (async (request, response) => {
  const requestUser = request.user;
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: {
        id: requestUser.id,
      },
      select: {
        username: true,
      },
    });
    response.json({
      success: true,
      username: user.username,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      response.status(400).json({
        success: false,
        error: error.message,
      });
    } else {
      response.status(500).json({
        success: false,
      });
      throw error;
    }
  }
}) as RequestHandler);

export default router;
