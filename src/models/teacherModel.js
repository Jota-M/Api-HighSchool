import { pool } from "../db/pool.js";

export const TeacherModel = {
  async create(teacherData) {
    const {
      firstName,
      lastName,
      motherLastName,
      idNumber,
      phone,
      email,
      birthDate,
      title,
      experience,
      subject,
      level,
      accountStatus,
      userId,
    } = teacherData;

    const query = `
      INSERT INTO teachers (
        first_name, last_name, mother_last_name, id_number, phone,
        email, birth_date, title, experience, subject, level,
        account_status, user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *;
    `;

    const values = [
      firstName,
      lastName,
      motherLastName,
      idNumber,
      phone,
      email,
      birthDate,
      title,
      experience,
      subject,
      level,
      accountStatus,
      userId,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  },
};
