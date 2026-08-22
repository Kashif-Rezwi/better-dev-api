import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class GenerateTitleDto {
  @IsString()
  @IsNotEmpty({ message: 'message must not be empty' })
  @MaxLength(10000)
  message: string;
}
