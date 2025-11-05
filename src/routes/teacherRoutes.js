import express from "express";
import { TeacherController } from "../controllers/teacherController.js";

const router = express.Router();

router.post("/", TeacherController.createTeacher);
router.get("/", TeacherController.getTeachers);


export default router;
