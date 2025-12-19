import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Message } from '../../chat/entities/message.entity';
import { Conversation } from '../../chat/entities/conversation.entity';

export enum FileType {
    IMAGE = 'image',
    PDF = 'pdf',
    DOCUMENT = 'document',
    VIDEO = 'video',
    AUDIO = 'audio',
}

export enum ExtractionStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    SUCCESS = 'success',
    FAILED = 'failed',
}

@Entity('attachments')
export class Attachment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ nullable: true })
    messageId?: string;

    @ManyToOne(() => Message, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'messageId' })
    message?: Message;

    @Column()
    conversationId: string;

    @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'conversationId' })
    conversation: Conversation;

    @Column()
    fileName: string;

    @Column({ type: 'enum', enum: FileType })
    fileType: FileType;

    @Column()
    mimeType: string;

    @Column({ type: 'bigint' })
    fileSize: number;

    @Column({ type: 'text' })
    storageUrl: string;

    @Column({ type: 'text' })
    storageKey: string;

    @Column({ type: 'text', nullable: true })
    thumbnailUrl?: string;

    @Column({ type: 'text', nullable: true })
    extractedText?: string;

    @Column({
        type: 'enum',
        enum: ExtractionStatus,
        default: ExtractionStatus.PENDING,
    })
    extractionStatus: ExtractionStatus;

    @Column({ type: 'jsonb', nullable: true })
    extractionMetadata?: Record<string, any>;

    @Column({ nullable: true })
    accessToken?: string;

    @Column({ type: 'timestamp', nullable: true })
    expiresAt?: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
