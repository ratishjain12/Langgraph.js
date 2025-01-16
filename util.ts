import nodemailer from "nodemailer";
import "dotenv/config";

export function parseFullName(fullName: string) {
  const nameParts = fullName.split(" ");
  const first_name = nameParts[0]; // Assuming first name is the first part
  const last_name = nameParts.slice(1).join(" "); // Everything else is considered the last name

  return { first_name, last_name };
}

export async function sendEmail(mailData: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}) {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_SENDER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: '"Agent" ratishjain6@gmail.com', // Sender's name and email
    to: mailData.to, // Recipient email
    subject: mailData.subject, // Email subject
    text: mailData.text, // Plain text body
    html: mailData.html, // HTML body
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
  }
}
