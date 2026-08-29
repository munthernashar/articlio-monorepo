import { promptExecutionService, PromptExecutionService } from '@/services/ai/prompt-execution.service';
import { promptRegistry, PromptRegistry } from '@/services/ai/prompt-registry';
import type {
  LegacyPromptExecutionRequestInput,
  PromptDefinition,
  PromptExecutionResult,
} from '@/services/ai/types';

export class AIOrchestratorService {
  constructor(
    private readonly executionService: PromptExecutionService,
    private readonly registry: PromptRegistry,
  ) {}

  executePrompt<TOutput = unknown>(
    request: LegacyPromptExecutionRequestInput,
  ): Promise<PromptExecutionResult<TOutput>> {
    return this.executionService.execute<TOutput>(request);
  }

  listPrompts(): PromptDefinition[] {
    return this.registry.listPrompts();
  }

  getPrompt(promptKey: string): PromptDefinition | null {
    return this.registry.getPromptByKey(promptKey);
  }
}

export const aiOrchestratorService = new AIOrchestratorService(promptExecutionService, promptRegistry);
