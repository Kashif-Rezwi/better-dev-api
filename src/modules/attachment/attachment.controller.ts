import {
    Controller,
    Post,
    Get,
    Delete,
    Param,
    Body,
    UploadedFile,
    UseInterceptors,
    UseGuards,
    Req,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AttachmentService } from './attachment.service';

@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentController {
    constructor(private attachmentService: AttachmentService) { }

    @Post('upload')
    @UseInterceptors(
        FileInterceptor('file', {
            limits: {
                fileSize: 50 * 1024 * 1024, // 50MB
            },
            fileFilter: (req, file, cb) => {
                // Allow images, PDFs, documents
                const allowedMimes = [
                    'image/jpeg',
                    'image/jpg',
                    'image/png',
                    'image/gif',
                    'image/webp',
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                ];

                if (allowedMimes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(
                        new BadRequestException(
                            `File type not supported: ${file.mimetype}`,
                        ),
                        false,
                    );
                }
            },
        }),
    )
    async uploadFile(
        @Req() req,
        @UploadedFile() file: Express.Multer.File,
        @Body('conversationId') conversationId: string,
        @Body('messageId') messageId: string,
    ) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        if (!conversationId) {
            throw new BadRequestException('conversationId is required');
        }

        return this.attachmentService.upload(
            file,
            conversationId,
            messageId, // Now optional
            req.user.userId,
        );
    }

    @Get(':id')
    async getAttachment(@Req() req, @Param('id') id: string) {
        return this.attachmentService.getAttachment(id, req.user.userId);
    }

    @Delete(':id')
    async deleteAttachment(@Req() req, @Param('id') id: string) {
        await this.attachmentService.deleteAttachment(id, req.user.userId);
        return { message: 'Attachment deleted successfully' };
    }
}
