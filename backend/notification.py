"""
Email Notification Module for LumenTrialGuide.AI

This module provides email notification capabilities for the application,
particularly for notifying users when long-running tasks are completed.
"""

import os
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class EmailNotifier:
    """
    Email notification service that handles sending emails to users.
    """

    def __init__(self, host: str, port: int, username: Optional[str] = None, password: Optional[str] = None):
        """
        Initialize the email notifier with SMTP server settings.

        Args:
            host: SMTP server hostname
            port: SMTP server port
            username: SMTP username for authentication (optional)
            password: SMTP password for authentication (optional)
        """
        self.host = host
        self.port = port
        self.username = username
        self.password = password

    def send_email(self, from_email: str, to_email: str, subject: str, 
                  body: str, cc_emails: Optional[List[str]] = None,
                  html_body: Optional[str] = None) -> bool:
        """
        Send an email notification.

        Args:
            from_email: Sender email address
            to_email: Recipient email address
            subject: Email subject
            body: Plain text email body
            cc_emails: Optional list of CC recipients
            html_body: Optional HTML version of the email body

        Returns:
            bool: True if email was sent successfully, False otherwise
        """
        try:
            # Create message
            message = MIMEMultipart('alternative')
            message['Subject'] = subject
            message['From'] = from_email
            message['To'] = to_email
            
            if cc_emails:
                message['Cc'] = ", ".join(cc_emails)
            
            # Attach plain text version
            message.attach(MIMEText(body, 'plain'))
            
            # Attach HTML version if provided
            if html_body:
                message.attach(MIMEText(html_body, 'html'))
            
            # Connect to SMTP server
            with smtplib.SMTP(self.host, self.port) as server:
                server.ehlo()
                
                # Use TLS if available
                if server.has_extn('STARTTLS'):
                    server.starttls()
                    server.ehlo()
                
                # Login if credentials provided
                if self.username and self.password:
                    server.login(self.username, self.password)
                
                # Build recipient list
                recipients = [to_email]
                if cc_emails:
                    recipients.extend(cc_emails)
                
                # Send email
                server.sendmail(from_email, recipients, message.as_string())
                
                logger.info(f"Email sent to {to_email}: {subject}")
                return True
                
        except Exception as e:
            logger.error(f"Failed to send email: {str(e)}")
            return False

    def send_task_completion_notification(self, to_email: str, task_name: str, 
                                         result_url: Optional[str] = None) -> bool:
        """
        Send a notification when a background task is completed.

        Args:
            to_email: Recipient email address
            task_name: The name of the completed task
            result_url: Optional URL to access the task results

        Returns:
            bool: True if email was sent successfully, False otherwise
        """
        subject = f"Task Completed: {task_name}"
        
        body = f"""
        Hello,

        Your requested task "{task_name}" has been completed successfully.
        """
        
        if result_url:
            body += f"""
        You can access the results at:
        {result_url}
            """
            
        body += """
        Thank you for using LumenTrialGuide.AI!

        Best regards,
        The LumenTrialGuide.AI Team
        """
        
        html_body = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ width: 100%; max-width: 600px; margin: 0 auto; }}
                .header {{ background-color: #4f46e5; color: white; padding: 20px; text-align: center; }}
                .content {{ padding: 20px; }}
                .button {{ display: inline-block; background-color: #4f46e5; color: white; 
                          padding: 10px 20px; text-decoration: none; border-radius: 4px; }}
                .footer {{ font-size: 12px; color: #666; padding: 20px; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Task Completed</h1>
                </div>
                <div class="content">
                    <p>Hello,</p>
                    <p>Your requested task "<strong>{task_name}</strong>" has been completed successfully.</p>
        """
        
        if result_url:
            html_body += f"""
                    <p>You can access the results here:</p>
                    <p><a href="{result_url}" class="button">View Results</a></p>
            """
            
        html_body += """
                    <p>Thank you for using LumenTrialGuide.AI!</p>
                </div>
                <div class="footer">
                    <p>© 2025 LumenTrialGuide.AI. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Send the email
        return self.send_email(
            from_email="notifications@lumen-trial-guide.ai",
            to_email=to_email,
            subject=subject,
            body=body,
            html_body=html_body
        )