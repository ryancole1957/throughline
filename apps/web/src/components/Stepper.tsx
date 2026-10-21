import type { Milestone, ProjectStage, ProjectStatus } from '@throughline/shared';

import { cn, formatDate } from '../lib/format';
import { Icon } from '../lib/icons';
import { useI18n } from '../lib/i18n';
import {
  PROJECT_STAGE_LABELS,
  PROJECT_STAGE_ORDER,
} from '../lib/labels';

interface StageStepperProps {
  stage: ProjectStage;
  status: ProjectStatus;
  milestones: Milestone[];
  compact?: boolean;
  vertical?: boolean;
}

export function StageStepper({
  stage,
  status,
  milestones,
  compact = false,
  vertical = false,
}: StageStepperProps) {
  const { t } = useI18n();
  const currentIndex = PROJECT_STAGE_ORDER.indexOf(stage);
  const milestoneMap = new Map(milestones.map((milestone) => [milestone.stage, milestone]));

  return (
    <ol
      className={cn('stepper', compact && 'stepper-compact', vertical && 'stepper-vertical')}
      aria-label={t('Project stages')}
    >
      {PROJECT_STAGE_ORDER.map((stageKey, index) => {
        const milestone = milestoneMap.get(stageKey);
        const complete =
          stage === 'closed' || index < currentIndex || Boolean(milestone?.completedAt);
        const current = stage !== 'closed' && index === currentIndex;
        const date = milestone?.completedAt
          ? formatDate(milestone.completedAt, true)
          : milestone?.plannedDate
            ? formatDate(milestone.plannedDate, true)
            : '';
        return (
          <li
            key={stageKey}
            className={cn(
              'stepper-item',
              complete && 'is-complete',
              current && 'is-current',
              current && status === 'paused' && 'is-paused',
            )}
            aria-current={current ? 'step' : undefined}
          >
            <span className="stepper-dot" aria-hidden="true">
              {complete ? <Icon name="check" size={9} /> : null}
            </span>
            <span className="stepper-copy">
              <span className="stepper-label">
                {t(PROJECT_STAGE_LABELS[stageKey])}
              </span>
              {date ? <span className="stepper-date">{date}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export type GateState = 'done' | 'active' | 'failed' | 'idle';

interface GateStep {
  label: string;
  person?: string | null;
  state: GateState;
}

export function GateChain({ steps }: { steps: GateStep[] }) {
  const { t } = useI18n();
  return (
    <ol className="gate-chain" aria-label={t('Submission, review, and acceptance gates')}>
      {steps.map((step, index) => (
        <li key={`${step.label}-${index}`} className={cn('gate-step', `gate-${step.state}`)}>
          <span className="gate-node" aria-hidden="true">
            {step.state === 'done' ? <Icon name="check" size={10} /> : null}
          </span>
          <span className="gate-copy">
            <span className="gate-label">{step.label}</span>
            {step.person ? <span className="gate-person">{step.person}</span> : null}
          </span>
          {index < steps.length - 1 ? <span className="gate-line" aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}
